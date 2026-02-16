import mongoose, { isValidObjectId } from "mongoose"
import { Tweet } from "../models/tweet.model.js"
import { ApiError } from "../utils/ApiError.js"
import { ApiResponse } from "../utils/ApiResponse.js"
import { asyncHandler } from "../utils/asyncHandler.js"

/* ======================================================
   CREATE TWEET
====================================================== */

const createTweet = asyncHandler(async (req, res) => {

  const { content } = req.body

  if (!content) {
    throw new ApiError(400, "Tweet content is required")
  }

  const tweet = await Tweet.create({
    content,
    owner: req.user._id
  })

  return res.status(201).json(
    new ApiResponse(201, tweet, "Tweet created successfully")
  )
})

/* ======================================================
   GET USER TWEETS
====================================================== */

const getUserTweets = asyncHandler(async (req, res) => {

  const { userId } = req.params

  if (!isValidObjectId(userId)) {
    throw new ApiError(400, "Invalid user id")
  }

  const tweets = await Tweet.find({ owner: userId })
    .sort({ createdAt: -1 })

  return res.status(200).json(
    new ApiResponse(200, tweets, "User tweets fetched successfully")
  )
})

/* ======================================================
   UPDATE TWEET
====================================================== */

const updateTweet = asyncHandler(async (req, res) => {

  const { tweetId } = req.params
  const { content } = req.body

  if (!content) {
    throw new ApiError(400, "Content required")
  }

  const tweet = await Tweet.findById(tweetId)

  if (!tweet) {
    throw new ApiError(404, "Tweet not found")
  }

  if (tweet.owner.toString() !== req.user._id.toString()) {
    throw new ApiError(403, "Not allowed")
  }

  tweet.content = content
  await tweet.save()

  return res.status(200).json(
    new ApiResponse(200, tweet, "Tweet updated successfully")
  )
})

/* ======================================================
   DELETE TWEET
====================================================== */

const deleteTweet = asyncHandler(async (req, res) => {

  const { tweetId } = req.params

  const tweet = await Tweet.findById(tweetId)

  if (!tweet) {
    throw new ApiError(404, "Tweet not found")
  }

  if (tweet.owner.toString() !== req.user._id.toString()) {
    throw new ApiError(403, "Not allowed")
  }

  await Tweet.findByIdAndDelete(tweetId)

  return res.status(200).json(
    new ApiResponse(200, {}, "Tweet deleted successfully")
  )
})

/* ====================================================== */

export {
  createTweet,
  getUserTweets,
  updateTweet,
  deleteTweet
}
