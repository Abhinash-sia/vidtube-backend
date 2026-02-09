import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { User } from "../models/user.models.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";
import { ApiResponse } from "../utils/ApiResponse.js";

import jwt from "jsonwebtoken"

const generateAccessAndRefreshToken = async (userID) => {
  try {
    const user = await User.findById(userID);

    const accessToken = user.generateAccessToken();  
    const refreshToken = user.generateRefreshToken(); 

    user.refreshToken = refreshToken;
    await user.save({ validateBeforeSave: false });

    return { accessToken, refreshToken };
  } catch (error) {
    throw new ApiError(
      500,
      "Something went wrong while generating refresh token"
    );
  }
};



const registerUser = asyncHandler(async (req, res) => {
  const { fullname, email, username, password } = req.body;

  if (
    [fullname, email, username, password].some(
      (field) => field?.trim() === ""
    )
  ) {
    throw new ApiError(400, "All fields are required");
  }

  const existsedUser = await User.findOne({
    $or: [{ username }, { email }],
  });

  if (existsedUser) {
    throw new ApiError(409, "User with email or username already exists");
  }

  const avatarLocalPath = req.files?.avatar?.[0]?.path;
  const coverImageLocalPath = req.files?.coverImage?.[0]?.path;

  if (!avatarLocalPath) {
    throw new ApiError(400, "Avatar file is required");
  }

  const avatar = await uploadOnCloudinary(avatarLocalPath);

  const coverImage = coverImageLocalPath
    ? await uploadOnCloudinary(coverImageLocalPath)
    : null;

  if (!avatar) {
    throw new ApiError(400, "Avatar file is required");
  }

  const user = await User.create({
    fullname,
    avatar: avatar.url,
    coverImage: coverImage?.url || "",
    email,
    password,
    username: username.toLowerCase(),
  });

  const createdUser = await User.findById(user._id).select(
    "-password -refreshToken"
  );

  if (!createdUser) {
    throw new ApiError(
      500,
      "Something went wrong while registering the user"
    );
  }

  return res.status(201).json(
    new ApiResponse(201, createdUser, "User registered successfully")
  );
});


const loginUser = asyncHandler(async (req, res) => {
  const { email, username, password } = req.body;

  
  if (!(username || email)) {
    throw new ApiError(400, "Username or email is required");
  }

  const user = await User.findOne({
    $or: [{ username }, { email }],
  });

  if (!user) {
    throw new ApiError(404, "User does not exist");
  }

  const isPasswordValid = await user.isPasswordCorrect(password);

  if (!isPasswordValid) {
    throw new ApiError(401, "Invalid user credentials");
  }

  const { accessToken, refreshToken } =
    await generateAccessAndRefreshToken(user._id);

  const loggedInUser = await User.findById(user._id).select(
    "-password -refreshToken"
  ); // FIXED

  const options = {
    httpOnly: true,
    secure: true, // set false in localhost if needed
  };

  return res
    .status(200)
    .cookie("accessToken", accessToken, options) // FIXED
    .cookie("refreshToken", refreshToken, options)
    .json(
      new ApiResponse(
        200,
        {
          user: loggedInUser,
          accessToken,
          refreshToken,
        },
        "User logged in successfully"
      )
    );
});

const logoutUser = asyncHandler(async(req , res) => {
  User.findByIdAndUpdate(
    req.user._id,
    {
      $set : {
        refreshToken : undefined
      }
    },
      {
        new : true
      }
    
  )

  const options = {
    httpOnly: true,
    secure: true, // set false in localhost if needed
  }

  return res
  .status(200)
  .clearCookie("accessToken" , options)
  .clearCookie("refreshToken" , options)
  .json(new ApiResponse (200 , {}, "user logged out"))
})


const refreshAccessToken = asyncHandler(async(req , res) => {
  const incomingRefeshToken = req.cookie.refreshToken || req.body.refreshToken

  if(incomingRefeshToken){
    throw new ApiError(401 , "unauthorised request")
  }
  try {
    const decoededToken = jwt.verify(
      incomingRefeshToken,
      process.env.REFRESH_TOKEN_SECRET
    )
  
    const user = User.findById(decoededToken?._id) 
  
    if(!user){
      throw new ApiError(401 , "Invalid refresh token")
    }
  
    if(incomingRefeshToken !== user?.refreshToken){
      throw new ApiError(401 , "Refresh token is expired or used ")
    }
  
  
    const options = {
      httpOnly : true,
      secure : true
    }
  
    const {accessToken , newRefreshToken} = await generateAccessAndRefreshToken(user._id)
  
    return res
    .status(200)
    .cookie("accessToken" , accessToken , options)
    .cookie("refreshToken" ,  newRefreshToken , options)
    .json(
      new ApiResponse (
        200 ,
        {accessToken , refreshToken : newRefreshToken},
        "Acess token refreshed"
      )
    )
  } catch (error) {
    throw new ApiError(401 , error?.message || 
      "Invalid refresh token"
    )
  }
})

export { registerUser, loginUser , logoutUser , refreshAccessToken};
