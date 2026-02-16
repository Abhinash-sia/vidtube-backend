import mongoose from "mongoose"
import { Video } from "../models/video.model.js"
import { Subscription } from "../models/subscription.model.js"
import { Like } from "../models/like.model.js"
import { ApiResponse } from "../utils/ApiResponse.js"
import { asyncHandler } from "../utils/asyncHandler.js"

/* ======================================================
   GET CHANNEL STATS
====================================================== */

const getChannelStats = asyncHandler(async (req, res) => {

  const channelId = req.user._id

  // total videos
  const totalVideos = await Video.countDocuments({
    owner: channelId
  })

  // total views
  const viewsAgg = await Video.aggregate([
    {
      $match: {
        owner: new mongoose.Types.ObjectId(channelId)
      }
    },
    {
      $group: {
        _id: null,
        totalViews: { $sum: "$views" }
      }
    }
  ])

  const totalViews = viewsAgg[0]?.totalViews || 0

  // total subscribers
  const totalSubscribers = await Subscription.countDocuments({
    channel: channelId
  })

  // total likes on videos
  const likesAgg = await Like.aggregate([
    {
      $lookup: {
        from: "videos",
        localField: "video",
        foreignField: "_id",
        as: "video"
      }
    },
    {
      $unwind: "$video"
    },
    {
      $match: {
        "video.owner": new mongoose.Types.ObjectId(channelId)
      }
    },
    {
      $group: {
        _id: null,
        totalLikes: { $sum: 1 }
      }
    }
  ])

  const totalLikes = likesAgg[0]?.totalLikes || 0

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        totalVideos,
        totalViews,
        totalSubscribers,
        totalLikes
      },
      "Channel stats fetched successfully"
    )
  )
})

/* ======================================================
   GET CHANNEL VIDEOS
====================================================== */

const getChannelVideos = asyncHandler(async (req, res) => {

  const channelId = req.user._id

  const videos = await Video.find({
    owner: channelId
  }).sort({ createdAt: -1 })

  return res.status(200).json(
    new ApiResponse(
      200,
      videos,
      "Channel videos fetched successfully"
    )
  )
})

/* ====================================================== */

export {
  getChannelStats,
  getChannelVideos
}
