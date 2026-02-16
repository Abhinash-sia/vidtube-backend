/*
 
 This file controls everything related to authentication:

 1) Register user
 2) Login user
 3) Logout user
 4) Refresh token
 5) Change password
 6) Get current user
 7) Update profile data

 FLOW (High Level):
 User -> Sends request -> Controller -> DB -> Token created -> Cookie set -> Response

*/

// Wraps async functions so we don't need try/catch everywhere
import { asyncHandler } from "../utils/asyncHandler.js";

// Custom error class (sends statusCode + message)
import { ApiError } from "../utils/ApiError.js";

// MongoDB User model
import { User } from "../models/user.model.js";

// Uploads image to Cloudinary and returns URL
import { uploadOnCloudinary } from "../utils/cloudinary.js";

// Standard response format
import { ApiResponse } from "../utils/ApiResponse.js";

// Used for verifying JWT tokens
import jwt from "jsonwebtoken";

// Needed for ObjectId in aggregation
import mongoose from "mongoose";

/* 
   TOKEN GENERATOR (CORE OF AUTH SYSTEM)
*/

const generateAccessAndRefreshToken = async (userID) => {

  // Step 1: Find user
  const user = await User.findById(userID);
  if (!user) {
    throw new ApiError(404, "User not found");
  }

  // Step 2: Create access token
  const accessToken = user.generateAccessToken();

  // Step 3: Create refresh token
  const refreshToken = user.generateRefreshToken();

  // Step 4: Store refresh token in DB
  user.refreshToken = refreshToken;
  await user.save({ validateBeforeSave: false });

  // Step 5: Return tokens
  return { accessToken, refreshToken };
};

/* ================= REGISTER ================= */

const registerUser = asyncHandler(async (req, res) => {

  // Step 1: Get data from frontend
  const { fullname, email, username, password } = req.body;

  // Step 2: Check empty fields
  if ([fullname, email, username, password].some((v) => v?.trim() === "")) {
    throw new ApiError(400, "All fields are required");
  }

  // Step 3: Check user already exists
  const existedUser = await User.findOne({
    $or: [{ username }, { email }]
  });

  if (existedUser) {
    throw new ApiError(409, "User already exists");
  }

  // Step 4: Get avatar file
  const avatarLocalPath = req.files?.avatar?.[0]?.path;
  if (!avatarLocalPath) {
    throw new ApiError(400, "Avatar is required");
  }

  // Step 5: Upload avatar
  const avatar = await uploadOnCloudinary(avatarLocalPath);

  // Step 6: Upload cover image (optional)
  const coverImageLocalPath = req.files?.coverImage?.[0]?.path;

  const coverImage = coverImageLocalPath
    ? await uploadOnCloudinary(coverImageLocalPath)
    : null;

  // Step 7: Save user in DB
  const user = await User.create({
    fullname,
    avatar: avatar.url,
    coverImage: coverImage?.url || "",
    email,
    password,
    username: username.toLowerCase(),
  });

  // Step 8: Remove sensitive fields
  const createdUser = await User.findById(user._id)
    .select("-password -refreshToken");

  // Step 9: Send response
  return res.status(201)
    .json(new ApiResponse(201, createdUser, "User registered successfully"));
});

/* ================= LOGIN ================= */

const loginUser = asyncHandler(async (req, res) => {

  // Step 1: Get credentials
  const { email, username, password } = req.body;

  // Step 2: Validate
  if (!(username || email)) {
    throw new ApiError(400, "Username or email required");
  }

  // Step 3: Find user
  const user = await User.findOne({
    $or: [{ username }, { email }]
  });

  if (!user) {
    throw new ApiError(404, "User not found");
  }

  // Step 4: Compare password
  const isPasswordValid = await user.isPasswordCorrect(password);
  if (!isPasswordValid) {
    throw new ApiError(401, "Wrong password");
  }

  // Step 5: Generate tokens
  const { accessToken, refreshToken } =
    await generateAccessAndRefreshToken(user._id);

  // Step 6: Remove sensitive data
  const loggedInUser = await User.findById(user._id)
    .select("-password -refreshToken");

  const options = {
    httpOnly: true,
    secure: true,
    sameSite: "none"
  };

  // Step 7: Send response
  return res.status(200)
    .cookie("accessToken", accessToken, options)
    .cookie("refreshToken", refreshToken, options)
    .json(
      new ApiResponse(
        200,
        { user: loggedInUser, accessToken, refreshToken },
        "Login successful"
      )
    );
});

/* ================= LOGOUT ================= */

const logoutUser = asyncHandler(async (req, res) => {

  // Step 1: Remove refresh token from DB
  await User.findByIdAndUpdate(
    req.user._id,
    { $set: { refreshToken: null } }
  );

  const options = {
    httpOnly: true,
    secure: true,
    sameSite: "none"
  };

  // Step 2: Clear cookies
  return res.status(200)
    .clearCookie("accessToken", options)
    .clearCookie("refreshToken", options)
    .json(new ApiResponse(200, {}, "User logged out"));
});

/* ================= REFRESH TOKEN ================= */

const refreshAccessToken = asyncHandler(async (req, res) => {

  // Step 1: Get refresh token
  const incomingRefreshToken =
    req.cookies?.refreshToken || req.body?.refreshToken;

  if (!incomingRefreshToken) {
    throw new ApiError(401, "Unauthorized");
  }

  let decodedToken;

  try {
    decodedToken = jwt.verify(
      incomingRefreshToken,
      process.env.REFRESH_TOKEN_SECRET
    );
  } catch (error) {
    throw new ApiError(401, "Invalid refresh token");
  }

  // Step 3: Find user
  const user = await User.findById(decodedToken._id);

  // Step 4: Compare tokens
  if (!user || incomingRefreshToken !== user.refreshToken) {
    throw new ApiError(401, "Invalid refresh token");
  }

  // Step 5: Generate new tokens
  const { accessToken, refreshToken } =
    await generateAccessAndRefreshToken(user._id);

  const options = {
    httpOnly: true,
    secure: true,
    sameSite: "none"
  };

  // Step 6: Send new tokens
  return res.status(200)
    .cookie("accessToken", accessToken, options)
    .cookie("refreshToken", refreshToken, options)
    .json(new ApiResponse(
      200,
      { accessToken, refreshToken },
      "Token refreshed"
    ));
});

/* ================= CHANGE PASSWORD ================= */

const changeCurrentPassword = asyncHandler(async (req, res) => {

  // Step 1: Get old & new password
  const { oldPassword, newPassword } = req.body;

  // Step 2: Find logged-in user
  const user = await User.findById(req.user._id);

  // Step 3: Compare old password
  const isPasswordCorrect =
    await user.isPasswordCorrect(oldPassword);

  if (!isPasswordCorrect) {
    throw new ApiError(400, "Old password is incorrect");
  }

  // Step 4: Set new password
  user.password = newPassword;

  // Step 5: Save new password
  await user.save({ validateBeforeSave: false });

  // Step 6: Send response
  return res.status(200)
    .json(new ApiResponse(200, {}, "Password changed successfully"));
});

/* ================= CURRENT USER ================= */

const getCurrentUser = asyncHandler(async (req, res) => {

  return res.status(200)
    .json(new ApiResponse(
      200,
      req.user,
      "Current user fetched successfully"
    ));
});

/* ================= UPDATE DETAILS ================= */

const updateAccountDetails = asyncHandler(async (req, res) => {

  const { fullname, email } = req.body;

  if (!fullname || !email) {
    throw new ApiError(400, "All fields are required");
  }

  const user = await User.findByIdAndUpdate(
    req.user._id,
    { $set: { fullname, email } },
    { new: true }
  ).select("-password");

  return res.status(200)
    .json(new ApiResponse(
      200,
      user,
      "Account details updated successfully"
    ));
});

/* ================= UPDATE AVATAR ================= */

const updateUserAvatar = asyncHandler(async (req, res) => {

  const avatarLocalPath = req.file?.path;

  if (!avatarLocalPath) {
    throw new ApiError(400, "Avatar file missing");
  }

  const avatar = await uploadOnCloudinary(avatarLocalPath);

  const user = await User.findByIdAndUpdate(
    req.user._id,
    { $set: { avatar: avatar.url } },
    { new: true }
  ).select("-password");

  return res.status(200)
    .json(new ApiResponse(200, user, "Avatar updated"));
});

/* ================= UPDATE COVER IMAGE ================= */

const updateUserCoverImage = asyncHandler(async (req, res) => {

  const coverImageLocalPath = req.file?.path;

  if (!coverImageLocalPath) {
    throw new ApiError(400, "Cover image file missing");
  }

  const coverImage = await uploadOnCloudinary(coverImageLocalPath);

  const user = await User.findByIdAndUpdate(
    req.user._id,
    { $set: { coverImage: coverImage.url } },
    { new: true }
  ).select("-password");

  return res.status(200)
    .json(new ApiResponse(200, user, "Cover image updated"));
});

/* ================= CHANNEL PROFILE ================= */

const getUserChannelProfile = asyncHandler(async (req, res) => {

  const { username } = req.params;

  if (!username?.trim()) {
    throw new ApiError(400, "username is missing");
  }

  const channel = await User.aggregate([
    {
      $match: { username: username.toLowerCase() }
    },
    {
      $lookup: {
        from: "subscriptions",
        localField: "_id",
        foreignField: "channel",
        as: "subscribers"
      }
    },
    {
      $lookup: {
        from: "subscriptions",
        localField: "_id",
        foreignField: "subscriber",
        as: "subscribedTo"
      }
    },
    {
      $addFields: {
        subscribersCount: { $size: "$subscribers" },
        channelsSubscribedToCount: { $size: "$subscribedTo" },
        isSubscribed: {
          $cond: {
            if: { $in: [req.user?._id, "$subscribers.subscriber"] },
            then: true,
            else: false
          }
        }
      }
    },
    {
      $project: {
        fullname: 1,
        username: 1,
        subscribersCount: 1,
        channelsSubscribedToCount: 1,
        isSubscribed: 1,
        avatar: 1,
        coverImage: 1,
        email: 1
      }
    }
  ]);

  if (!channel.length) {
    throw new ApiError(404, "channel does not exists");
  }

  return res.status(200)
    .json(new ApiResponse(
      200,
      channel[0],
      "User channel fetched successfully"
    ));
});

/* ================= WATCH HISTORY ================= */

const getWatchHistory = asyncHandler(async (req, res) => {

  const user = await User.aggregate([
    {
      $match: {
        _id: new mongoose.Types.ObjectId(req.user._id)
      }
    },
    {
      $lookup: {
        from: "videos",
        localField: "watchHistory",
        foreignField: "_id",
        as: "watchHistory",
        pipeline: [
          {
            $lookup: {
              from: "users",
              localField: "owner",
              foreignField: "_id",
              as: "owner",
              pipeline: [
                {
                  $project: {
                    fullname: 1,
                    username: 1,
                    avatar: 1
                  }
                }
              ]
            }
          },
          {
            $addFields: {
              owner: { $first: "$owner" }
            }
          }
        ]
      }
    }
  ]);

  return res.status(200)
    .json(new ApiResponse(
      200,
      user[0].watchHistory,
      "Watch history fetched successfully"
    ));
});

/* ================= EXPORTS ================= */

export {
  registerUser,
  loginUser,
  logoutUser,
  refreshAccessToken,
  changeCurrentPassword,
  getCurrentUser,
  updateAccountDetails,
  updateUserAvatar,
  updateUserCoverImage,
  getUserChannelProfile,
  getWatchHistory
};
