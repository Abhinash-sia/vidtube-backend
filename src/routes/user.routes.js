/********************************************************************
 USER ROUTES FILE

 This file defines all endpoints related to users.

 Flow:
 Client Request → Route → Middleware (if any) → Controller

********************************************************************/

import { Router } from "express";

// Import all user controllers
import { 
    loginUser,                 // login
    logoutUser,                // logout
    registerUser,              // register
    refreshAccessToken,        // generate new access token
    changeCurrentPassword,     // change password
    getCurrentUser,            // get logged-in user
    updateUserAvatar,          // update avatar image
    updateUserCoverImage,      // update cover image
    getUserChannelProfile,     // get channel profile
    getWatchHistory,           // get watch history
    updateAccountDetails       // update name & email
} from "../controllers/user.controller.js";

// Multer middleware for file uploads
import { upload } from "../middlewares/multer.middleware.js";

// JWT verification middleware
import { verifyJWT } from "../middlewares/auth.middleware.js";

// Create router instance
const router = Router()

/* public routes no login required*/

// Register new user (with avatar & cover image)
router.route("/register").post(

    // Accept multiple files from frontend
    upload.fields([
        {
            name: "avatar",      // avatar image
            maxCount: 1
        }, 
        {
            name: "coverImage",  // cover image
            maxCount: 1
        }
    ]),

    // Controller
    registerUser
)

// Login user
router.route("/login").post(loginUser)

// Refresh access token using refresh token
router.route("/refresh-token").post(refreshAccessToken)


/* 
   PROTECTED ROUTES (LOGIN REQUIRED)
*/

// verifyJWT checks if user is logged in

// Logout
router.route("/logout").post(verifyJWT, logoutUser)

// Change password
router.route("/change-password").post(
    verifyJWT,
    changeCurrentPassword
)

// Get logged-in user
router.route("/current-user").get(
    verifyJWT,
    getCurrentUser
)

// Update name & email
router.route("/update-account").patch(
    verifyJWT,
    updateAccountDetails
)

// Update avatar image
router.route("/avatar").patch(
    verifyJWT,
    upload.single("avatar"),
    updateUserAvatar
)

// Update cover image
router.route("/cover-image").patch(
    verifyJWT,
    upload.single("coverImage"),
    updateUserCoverImage
)

// Get any user's channel profile
router.route("/c/:username").get(
    verifyJWT,
    getUserChannelProfile
)

// Get watch history of logged-in user
router.route("/history").get(
    verifyJWT,
    getWatchHistory
)

/* 
   EXPORT ROUTER
*/

export default router
