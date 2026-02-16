import mongoose, { isValidObjectId } from "mongoose"
import { User } from "../models/user.model.js"
import { Subscription } from "../models/subscription.model.js"
import { ApiError } from "../utils/ApiError.js"
import { ApiResponse } from "../utils/ApiResponse.js"
import { asyncHandler } from "../utils/asyncHandler.js"

/* ======================================================
   TOGGLE SUBSCRIPTION
====================================================== */

const toggleSubscription = asyncHandler(async (req, res) => {

  const { channelId } = req.params

  if (!isValidObjectId(channelId)) {
    throw new ApiError(400, "Invalid channel id")
  }

  if (channelId === req.user._id.toString()) {
    throw new ApiError(400, "You cannot subscribe to yourself")
  }

  const existingSub = await Subscription.findOne({
    channel: channelId,
    subscriber: req.user._id
  })

  // Unsubscribe
  if (existingSub) {
    await Subscription.findByIdAndDelete(existingSub._id)

    return res.status(200).json(
      new ApiResponse(200, { subscribed: false }, "Unsubscribed successfully")
    )
  }

  // Subscribe
  await Subscription.create({
    channel: channelId,
    subscriber: req.user._id
  })

  return res.status(200).json(
    new ApiResponse(200, { subscribed: true }, "Subscribed successfully")
  )
})

/* ======================================================
   GET CHANNEL SUBSCRIBERS
====================================================== */

const getUserChannelSubscribers = asyncHandler(async (req, res) => {

  const { channelId } = req.params

  const subscribers = await Subscription.aggregate([
    {
      $match: {
        channel: new mongoose.Types.ObjectId(channelId)
      }
    },
    {
      $lookup: {
        from: "users",
        localField: "subscriber",
        foreignField: "_id",
        as: "subscriber",
        pipeline: [
          {
            $project: {
              username: 1,
              avatar: 1
            }
          }
        ]
      }
    },
    {
      $addFields: {
        subscriber: { $first: "$subscriber" }
      }
    }
  ])

  return res.status(200).json(
    new ApiResponse(
      200,
      subscribers,
      "Subscribers fetched successfully"
    )
  )
})

/* ======================================================
   GET SUBSCRIBED CHANNELS
====================================================== */

const getSubscribedChannels = asyncHandler(async (req, res) => {

  const { subscriberId } = req.params

  const channels = await Subscription.aggregate([
    {
      $match: {
        subscriber: new mongoose.Types.ObjectId(subscriberId)
      }
    },
    {
      $lookup: {
        from: "users",
        localField: "channel",
        foreignField: "_id",
        as: "channel",
        pipeline: [
          {
            $project: {
              username: 1,
              avatar: 1
            }
          }
        ]
      }
    },
    {
      $addFields: {
        channel: { $first: "$channel" }
      }
    }
  ])

  return res.status(200).json(
    new ApiResponse(
      200,
      channels,
      "Subscribed channels fetched successfully"
    )
  )
})

/* ====================================================== */

export {
  toggleSubscription,
  getUserChannelSubscribers,
  getSubscribedChannels
}
