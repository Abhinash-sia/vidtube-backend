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

/* 
   TOKEN GENERATOR (CORE OF AUTH SYSTEM)
  

   INTERNAL FLOW:
   1) Find user from DB
   2) Create Access Token  (short life)
   3) Create Refresh Token (long life)
   4) Save refresh token in DB
   5) Return both tokens

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

const registerUser = asyncHandler(async (req, res) => {
  // Step 1: Get data from frontend
  const { fullname, email, username, password } = req.body;

  // Step 2: Check empty fields
  if ([fullname, email, username, password].some((v) => v?.trim() === "")) {
    throw new ApiError(400, "All fields are required");
  }

  // Step 3: Check user already exists
  const existedUser = await User.findOne({
    $or: [{ username }, { email }],
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
  const createdUser = await User.findById(user._id).select(
    "-password -refreshToken"
  );

  // Step 9: Send response
  return res
    .status(201)
    .json(new ApiResponse(201, createdUser, "User registered successfully"));
});

const loginUser = asyncHandler(async (req, res) => {
  // Step 1: Get credentials
  const { email, username, password } = req.body;

  // Step 2: Validate
  if (!(username || email)) {
    throw new ApiError(400, "Username or email required");
  }

  // Step 3: Find user
  const user = await User.findOne({
    $or: [{ username }, { email }],
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
  const { accessToken, refreshToken } = await generateAccessAndRefreshToken(
    user._id
  );

  // Step 6: Remove sensitive data
  const loggedInUser = await User.findById(user._id).select(
    "-password -refreshToken"
  );

  // Step 7: Store tokens in cookies
  const options = {
    httpOnly: true, // JS cannot access cookie
    secure: true, // HTTPS only
  };

  // Step 8: Send response
  return res
    .status(200)
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

const logoutUser = asyncHandler(async (req, res) => {
  // Step 1: Remove refresh token from DB
  await User.findByIdAndUpdate(
    req.user._id,
    { $set: { refreshToken: null } },
    { new: true }
  );

  const options = {
    httpOnly: true,
    secure: true,
  };

  // Step 2: Clear cookies
  return res
    .status(200)
    .clearCookie("accessToken", options)
    .clearCookie("refreshToken", options)
    .json(new ApiResponse(200, {}, "User logged out"));
});

const refreshAccessToken = asyncHandler(async (req, res) => {
  // Step 1: Get refresh token
  const incomingRefreshToken =
    req.cookies?.refreshToken || req.body?.refreshToken;

  if (!incomingRefreshToken) {
    throw new ApiError(401, "Unauthorized");
  }

  // Step 2: Verify token
  const decodedToken = jwt.verify(
    incomingRefreshToken,
    process.env.REFRESH_TOKEN_SECRET
  );

  // Step 3: Find user
  const user = await User.findById(decodedToken._id);

  // Step 4: Compare tokens
  if (!user || incomingRefreshToken !== user.refreshToken) {
    throw new ApiError(401, "Invalid refresh token");
  }

  // Step 5: Generate new tokens
  const { accessToken, refreshToken } = await generateAccessAndRefreshToken(
    user._id
  );

  const options = {
    httpOnly: true,
    secure: true,
  };

  // Step 6: Send new tokens
  return res
    .status(200)
    .cookie("accessToken", accessToken, options)
    .cookie("refreshToken", refreshToken, options)
    .json(
      new ApiResponse(200, { accessToken, refreshToken }, "Token refreshed")
    );
});

const changeCurrenstPassowrd = asyncHandler(async (req, res) => {
  // Step 1: Get old & new password from frontend
  const { oldPassowrd, newPassword } = req.body;

  // Step 2: Find logged-in user
  const user = await User.findById(req.user._id);

  // Step 3: Compare old password with DB password
  const isPasswordCorrect = await user.isPasswordCorrect(oldPassowrd);

  if (!isPasswordCorrect) {
    throw new ApiError(400, "Old password is incorrect");
  }

  // Step 4: Set new password
  user.password = newPassword;

  // Step 5: Save new password
  await user.save({ validateBeforeSave: false });

  // Step 6: Send response
  return res
    .status(200)
    .json(new ApiResponse(200, {}, "Password changed successfully"));
});

const getCurrestUser = asyncHandler(async (req, res) => {
  // req.user is attached by auth middleware
  return res
    .status(200)
    .json(new ApiResponse(200, req.user, "Current user fetched successfully"));
});

const updateAccountDeatil = asyncHandler(async (req, res) => {
  // Step 1: Get new name and email
  const { fullname, email } = req.body;

  if (!fullname || !email) {
    throw new ApiError(400, "All fields are required");
  }

  // Step 2: Update DB
  const user = await User.findByIdAndUpdate(
    req.user._id,
    {
      $set: { fullname, email },
    },
    { new: true }
  ).select("-password");

  // Step 3: Send updated user
  return res
    .status(200)
    .json(new ApiResponse(200, user, "Account details updated successfully"));
});

const updateAvtar = asyncHandler(async (req, res) => {
  // Step 1: Get file path
  const avatarLocalPath = req.file?.path;

  if (!avatarLocalPath) {
    throw new ApiError(400, "Avatar file missing");
  }

  // Step 2: Upload to cloudinary
  const avatar = await uploadOnCloudinary(avatarLocalPath);

  // Step 3: Save new avatar URL
  const user = await User.findByIdAndUpdate(
    req.user._id,
    {
      $set: { avatar: avatar.url },
    },
    { new: true }
  ).select("-password");

  // Step 4: Send response
  return res.status(200).json(new ApiResponse(200, user, "Avatar updated"));
});

const updateCoverImage = asyncHandler(async (req, res) => {
  // Step 1: Get file path
  const coverImageLocalPath = req.file?.path;

  if (!coverImageLocalPath) {
    throw new ApiError(400, "Cover image file missing");
  }

  // Step 2: Upload image
  const coverImage = await uploadOnCloudinary(coverImageLocalPath);

  // Step 3: Save cover image URL
  const user = await User.findByIdAndUpdate(
    req.user._id,
    {
      $set: { coverImage: coverImage.url },
    },
    { new: true }
  ).select("-password");

  // Step 4: Send response
  return res
    .status(200)
    .json(new ApiResponse(200, user, "Cover image updated"));
});

/* 

   What this does:
   - Takes a username from URL
   - Finds that user (channel)
   - Counts subscribers
   - Counts how many channels this user subscribed to
   - Checks if current logged-in user is subscribed or not
*/

const getUserChannelProfile = asyncHandler(async (req, res) => {
  // Get username from URL: /channel/:username
  const { username } = req.params;

  // If username missing or empty
  if (!username?.trim()) {
    throw new ApiError(400, "username is missing");
  }

  /*
      Using MongoDB aggregation because:
      We need to join multiple collections and calculate fields
    */

  const channel = await User.aggregate([
    // Step 1: Find user with given username
    {
      $match: {
        username: username?.toLowerCase(),
      },
    },

    // Step 2: Find all subscribers of this channel
    {
      $lookup: {
        from: "subscriptions", // collection name
        localField: "_id", // User _id
        foreignField: "channel", // channel field in subscriptions
        as: "subscribers",
      },
    },

    // Step 3: Find channels this user has subscribed to
    {
      $lookup: {
        from: "subscriptions",
        localField: "_id",
        foreignField: "subscriber",
        as: "subscribedTo",
      },
    },

    // Step 4: Add calculated fields
    {
      $addFields: {
        // Total subscribers count
        subscribersCount: {
          $size: "$subscribers",
        },

        // Total channels user subscribed to
        channelsSubscribedToCount: {
          $size: "$subscribedTo",
        },

        // Check if logged-in user is subscribed
        isSubscribed: {
          $cond: {
            if: {
              $in: [req.user?._id, "$subscribers.subscriber"],
            },
            then: true,
            else: false,
          },
        },
      },
    },

    // Step 5: Send only required fields
    {
      $project: {
        fullName: 1,
        username: 1,
        subscribersCount: 1,
        channelsSubscribedToCount: 1,
        isSubscribed: 1,
        avatar: 1,
        coverImage: 1,
        email: 1,
      },
    },
  ]);

  // If channel not found
  if (!channel?.length) {
    throw new ApiError(404, "channel does not exists");
  }

  // Return first object (because aggregate returns array)
  return res
    .status(200)
    .json(
      new ApiResponse(200, channel[0], "User channel fetched successfully")
    );
});

/* 

   What this does:
   - Gets logged-in user
   - Fetches all watched videos
   - For each video, fetch owner info
*/

const getWatchHistory = asyncHandler(async (req, res) => {
  const user = await User.aggregate([
    // Step 1: Find current user by ID
    {
      $match: {
        _id: new mongoose.Types.ObjectId(req.user._id),
      },
    },

    // Step 2: Join videos collection
    {
      $lookup: {
        from: "videos",
        localField: "watchHistory", // array of video IDs
        foreignField: "_id",
        as: "watchHistory",

        // Extra pipeline for each video
        pipeline: [
          // Step 3: Get owner (uploader) of each video
          {
            $lookup: {
              from: "users",
              localField: "owner",
              foreignField: "_id",
              as: "owner",

              // Only return needed fields
              pipeline: [
                {
                  $project: {
                    fullName: 1,
                    username: 1,
                    avatar: 1,
                  },
                },
              ],
            },
          },

          // Step 4: Convert owner array into object
          {
            $addFields: {
              owner: {
                $first: "$owner",
              },
            },
          },
        ],
      },
    },
  ]);

  // Send only watch history array
  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        user[0].watchHistory,
        "Watch history fetched successfully"
      )
    );
});

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
  getWatchHistory,
};
