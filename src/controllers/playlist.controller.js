import mongoose, { isValidObjectId } from "mongoose"
import { Playlist } from "../models/playlist.model.js"
import { ApiError } from "../utils/ApiError.js"
import { ApiResponse } from "../utils/ApiResponse.js"
import { asyncHandler } from "../utils/asyncHandler.js"

/* ======================================================
   CREATE PLAYLIST
====================================================== */

const createPlaylist = asyncHandler(async (req, res) => {

  const { name, description } = req.body

  if (!name) {
    throw new ApiError(400, "Playlist name is required")
  }

  const playlist = await Playlist.create({
    name,
    description,
    owner: req.user._id,
    videos: []
  })

  return res.status(201).json(
    new ApiResponse(201, playlist, "Playlist created successfully")
  )
})

/* ======================================================
   GET USER PLAYLISTS
====================================================== */

const getUserPlaylists = asyncHandler(async (req, res) => {

  const { userId } = req.params

  if (!isValidObjectId(userId)) {
    throw new ApiError(400, "Invalid user id")
  }

  const playlists = await Playlist.find({ owner: userId })

  return res.status(200).json(
    new ApiResponse(200, playlists, "User playlists fetched successfully")
  )
})

/* ======================================================
   GET PLAYLIST BY ID
====================================================== */

const getPlaylistById = asyncHandler(async (req, res) => {

  const { playlistId } = req.params

  if (!isValidObjectId(playlistId)) {
    throw new ApiError(400, "Invalid playlist id")
  }

  const playlist = await Playlist.findById(playlistId)
    .populate("videos")

  if (!playlist) {
    throw new ApiError(404, "Playlist not found")
  }

  return res.status(200).json(
    new ApiResponse(200, playlist, "Playlist fetched successfully")
  )
})

/* ======================================================
   ADD VIDEO TO PLAYLIST
====================================================== */

const addVideoToPlaylist = asyncHandler(async (req, res) => {

  const { playlistId, videoId } = req.params

  if (!isValidObjectId(playlistId) || !isValidObjectId(videoId)) {
    throw new ApiError(400, "Invalid id")
  }

  const playlist = await Playlist.findById(playlistId)

  if (!playlist) {
    throw new ApiError(404, "Playlist not found")
  }

  if (playlist.owner.toString() !== req.user._id.toString()) {
    throw new ApiError(403, "Not allowed")
  }

  if (playlist.videos.includes(videoId)) {
    throw new ApiError(400, "Video already in playlist")
  }

  playlist.videos.push(videoId)
  await playlist.save()

  return res.status(200).json(
    new ApiResponse(200, playlist, "Video added to playlist")
  )
})

/* ======================================================
   REMOVE VIDEO FROM PLAYLIST
====================================================== */

const removeVideoFromPlaylist = asyncHandler(async (req, res) => {

  const { playlistId, videoId } = req.params

  const playlist = await Playlist.findById(playlistId)

  if (!playlist) {
    throw new ApiError(404, "Playlist not found")
  }

  if (playlist.owner.toString() !== req.user._id.toString()) {
    throw new ApiError(403, "Not allowed")
  }

  playlist.videos = playlist.videos.filter(
    (vid) => vid.toString() !== videoId
  )

  await playlist.save()

  return res.status(200).json(
    new ApiResponse(200, playlist, "Video removed from playlist")
  )
})

/* ======================================================
   DELETE PLAYLIST
====================================================== */

const deletePlaylist = asyncHandler(async (req, res) => {

  const { playlistId } = req.params

  const playlist = await Playlist.findById(playlistId)

  if (!playlist) {
    throw new ApiError(404, "Playlist not found")
  }

  if (playlist.owner.toString() !== req.user._id.toString()) {
    throw new ApiError(403, "Not allowed")
  }

  await Playlist.findByIdAndDelete(playlistId)

  return res.status(200).json(
    new ApiResponse(200, {}, "Playlist deleted successfully")
  )
})

/* ======================================================
   UPDATE PLAYLIST
====================================================== */

const updatePlaylist = asyncHandler(async (req, res) => {

  const { playlistId } = req.params
  const { name, description } = req.body

  const playlist = await Playlist.findById(playlistId)

  if (!playlist) {
    throw new ApiError(404, "Playlist not found")
  }

  if (playlist.owner.toString() !== req.user._id.toString()) {
    throw new ApiError(403, "Not allowed")
  }

  if (name) playlist.name = name
  if (description) playlist.description = description

  await playlist.save()

  return res.status(200).json(
    new ApiResponse(200, playlist, "Playlist updated successfully")
  )
})

/* ====================================================== */

export {
  createPlaylist,
  getUserPlaylists,
  getPlaylistById,
  addVideoToPlaylist,
  removeVideoFromPlaylist,
  deletePlaylist,
  updatePlaylist
}
