import mongoose, { isValidObjectId } from "mongoose"
import { Video } from "../models/video.model.js"
import { User } from "../models/user.model.js"
import { ApiError } from "../utils/ApiError.js"
import { ApiResponse } from "../utils/ApiResponse.js"
import { asyncHandler } from "../utils/asyncHandler.js"
import { uploadOnCloudinary } from "../utils/cloudinary.js"

/* ======================================================
   GET ALL VIDEOS (with pagination, search, sorting)
====================================================== */

const getAllVideos = asyncHandler(async (req, res) => {

  const { 
    page = 1, 
    limit = 10, 
    query, 
    sortBy = "createdAt", 
    sortType = "desc", 
    userId 
  } = req.query

  const pipeline = []

  // Search by title
  if (query) {
    pipeline.push({
      $match: {
        title: { $regex: query, $options: "i" }
      }
    })
  }

  // Filter by owner
  if (userId && isValidObjectId(userId)) {
    pipeline.push({
      $match: {
        owner: new mongoose.Types.ObjectId(userId)
      }
    })
  }

  // Only published videos
  pipeline.push({
    $match: { isPublished: true }
  })

  // Sort
  pipeline.push({
    $sort: {
      [sortBy]: sortType === "asc" ? 1 : -1
    }
  })

  // Populate owner
  pipeline.push({
    $lookup: {
      from: "users",
      localField: "owner",
      foreignField: "_id",
      as: "owner",
      pipeline: [
        {
          $project: {
            username: 1,
            avatar: 1
          }
        }
      ]
    }
  })

  pipeline.push({
    $addFields: {
      owner: { $first: "$owner" }
    }
  })

  const options = {
    page: Number(page),
    limit: Number(limit)
  }

  const videos = await Video.aggregatePaginate(
    Video.aggregate(pipeline),
    options
  )

  return res.status(200).json(
    new ApiResponse(200, videos, "Videos fetched successfully")
  )
})

/* ======================================================
   PUBLISH VIDEO
====================================================== */

const publishAVideo = asyncHandler(async (req, res) => {

  const { title, description } = req.body

  if (!title || !description) {
    throw new ApiError(400, "Title and description required")
  }

  const videoLocalPath = req.files?.video?.[0]?.path
  const thumbnailLocalPath = req.files?.thumbnail?.[0]?.path

  if (!videoLocalPath || !thumbnailLocalPath) {
    throw new ApiError(400, "Video and thumbnail required")
  }

  // Upload video
  const videoFile = await uploadOnCloudinary(videoLocalPath)
  const thumbnail = await uploadOnCloudinary(thumbnailLocalPath)

  const video = await Video.create({
    title,
    description,
    videoFile: videoFile.url,
    thumbnail: thumbnail.url,
    duration: videoFile.duration || 0,
    owner: req.user._id
  })

  return res.status(201).json(
    new ApiResponse(201, video, "Video published successfully")
  )
})

/* ======================================================
   GET VIDEO BY ID
====================================================== */

const getVideoById = asyncHandler(async (req, res) => {

  const { videoId } = req.params

  if (!isValidObjectId(videoId)) {
    throw new ApiError(400, "Invalid video id")
  }

  const video = await Video.findById(videoId)
    .populate("owner", "username avatar")

  if (!video) {
    throw new ApiError(404, "Video not found")
  }

  // Increase view count
  video.views += 1
  await video.save({ validateBeforeSave: false })

  return res.status(200).json(
    new ApiResponse(200, video, "Video fetched successfully")
  )
})

/* ======================================================
   UPDATE VIDEO
====================================================== */

const updateVideo = asyncHandler(async (req, res) => {

  const { videoId } = req.params
  const { title, description } = req.body

  if (!isValidObjectId(videoId)) {
    throw new ApiError(400, "Invalid video id")
  }

  const video = await Video.findById(videoId)

  if (!video) {
    throw new ApiError(404, "Video not found")
  }

  // Only owner can update
  if (video.owner.toString() !== req.user._id.toString()) {
    throw new ApiError(403, "Not allowed")
  }

  if (title) video.title = title
  if (description) video.description = description

  const thumbnailLocalPath = req.file?.path

  if (thumbnailLocalPath) {
    const thumbnail = await uploadOnCloudinary(thumbnailLocalPath)
    video.thumbnail = thumbnail.url
  }

  await video.save()

  return res.status(200).json(
    new ApiResponse(200, video, "Video updated successfully")
  )
})

/* ======================================================
   DELETE VIDEO
====================================================== */

const deleteVideo = asyncHandler(async (req, res) => {

  const { videoId } = req.params

  const video = await Video.findById(videoId)

  if (!video) {
    throw new ApiError(404, "Video not found")
  }

  if (video.owner.toString() !== req.user._id.toString()) {
    throw new ApiError(403, "Not allowed")
  }

  await Video.findByIdAndDelete(videoId)

  return res.status(200).json(
    new ApiResponse(200, {}, "Video deleted successfully")
  )
})

/* ======================================================
   TOGGLE PUBLISH STATUS
====================================================== */

const togglePublishStatus = asyncHandler(async (req, res) => {

  const { videoId } = req.params

  const video = await Video.findById(videoId)

  if (!video) {
    throw new ApiError(404, "Video not found")
  }

  video.isPublished = !video.isPublished
  await video.save()

  return res.status(200).json(
    new ApiResponse(200, video, "Publish status updated")
  )
})

/* ====================================================== */

export {
  getAllVideos,
  publishAVideo,
  getVideoById,
  updateVideo,
  deleteVideo,
  togglePublishStatus
}
