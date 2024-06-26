import express from 'express';
import { createEvent,number_attendences, getAllEvents, getEventById,getEventbyuserID,NextEventDate, updateEvent, deleteEvent,  getLastEventRemainingTasks  , getEventAttendeeTypeCounts } from '../controllers/eventController.mjs';
import { getTasksByEventId } from '../controllers/taskController.mjs';
import { authMiddleware , isAdmin } from '../middlewares/authMiddleware.mjs';

const router = express.Router();

// @desc Create a new event
// @route POST /api/v1/events
// @access Admin
router.post('/create', createEvent); // done

// @desc Get all events
// @route GET /api/v1/events
// @access Public
router.get('/list', authMiddleware ,getAllEvents); // done

// @desc Get a specific event
// @route GET /api/v1/events/:id
// @access Public
router.get('/:id', getEventById); // done
// @desc Get a specific user  events
// @route GET /api/v1/events/:id
// @access Public

router.get("/user/:id" , getEventbyuserID);
// @desc Update an event
// @route PUT /api/v1/events/:id
// @access Admin
router.put('/:id',authMiddleware,  updateEvent); // done

// @desc Delete an event
// @route DELETE /api/v1/events/:id
// @access Admin
router.delete('/:id' ,authMiddleware, deleteEvent); // done

// @desc Get tasks of a specific event
// @route Get /api/v1/task:eventid

router.get('/tasks/:eventId',authMiddleware ,getTasksByEventId);
 

//@desc statictics routes
router.get("/statistics/nextEventDate/:eventId", NextEventDate)
      .get('/statistics/attandeeTypeCounts/:eventId', getEventAttendeeTypeCounts)
      .get("/statistics/last-event", getLastEventRemainingTasks)
      .get("/statistics/attendence/:eventId",number_attendences)

export default router;





