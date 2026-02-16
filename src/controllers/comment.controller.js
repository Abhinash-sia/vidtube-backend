import mongoose from "mongoose"
import { Comment } from "../models/comment.model.js"
import { ApiError } from "../utils/ApiError.js"
import { ApiResponse } from "../utils/ApiResponse.js"
import { asyncHandler } from "../utils/asyncHandler.js"
import { isValidObjectId } from "mongoose"

/* ======================================================
   GET VIDEO COMMENTS
====================================================== */

const getVideoComments = asyncHandler(async (req, res) => {

  const { videoId } = req.params
  const { page = 1, limit = 10 } = req.query

  if (!isValidObjectId(videoId)) {
    throw new ApiError(400, "Invalid video id")
  }

  const comments = await Comment.aggregate([
    {
      $match: {
        video: new mongoose.Types.ObjectId(videoId)
      }
    },
    {
      $sort: { createdAt: -1 }
    },
    {
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
    },
    {
      $addFields: {
        owner: { $first: "$owner" }
      }
    }
  ])

  const start = (page - 1) * limit
  const paginatedComments = comments.slice(start, start + Number(limit))

  return res.status(200).json(
    new ApiResponse(
      200,
      paginatedComments,
      "Comments fetched successfully"
    )
  )
})

/* ======================================================
   ADD COMMENT
====================================================== */

const addComment = asyncHandler(async (req, res) => {

  const { videoId } = req.params
  const { content } = req.body

  if (!content) {
    throw new ApiError(400, "Comment content required")
  }

  const comment = await Comment.create({
    content,
    video: videoId,
    owner: req.user._id
  })

  return res.status(201).json(
    new ApiResponse(201, comment, "Comment added successfully")
  )
})

/* ======================================================
   UPDATE COMMENT
====================================================== */

const updateComment = asyncHandler(async (req, res) => {

  const { commentId } = req.params
  const { content } = req.body

  if (!content) {
    throw new ApiError(400, "Content required")
  }

  const comment = await Comment.findById(commentId)

  if (!comment) {
    throw new ApiError(404, "Comment not found")
  }

  if (comment.owner.toString() !== req.user._id.toString()) {
    throw new ApiError(403, "Not allowed")
  }

  comment.content = content
  await comment.save()

  return res.status(200).json(
    new ApiResponse(200, comment, "Comment updated successfully")
  )
})

/* ======================================================
   DELETE COMMENT
====================================================== */

const deleteComment = asyncHandler(async (req, res) => {

  const { commentId } = req.params

  const comment = await Comment.findById(commentId)

  if (!comment) {
    throw new ApiError(404, "Comment not found")
  }

  if (comment.owner.toString() !== req.user._id.toString()) {
    throw new ApiError(403, "Not allowed")
  }

  await Comment.findByIdAndDelete(commentId)

  return res.status(200).json(
    new ApiResponse(200, {}, "Comment deleted successfully")
  )
})

/* ====================================================== */

export {
  getVideoComments,
  addComment,
  updateComment,
  deleteComment
}
