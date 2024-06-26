import moment from 'moment'
import Event from '../models/Event.mjs';
import User from '../models/User.mjs';
import ticket from '../models/Ticket.mjs';
import asyncHandler from 'express-async-handler';

export const createEvent = asyncHandler(async (req, res) => {
  try {
    const user = await User.findById(req.body.id);
    switch(user.plan) {
      case 'vip':
        if (user.OrganizedEvents.length > 11) {
          return res.status(401).json({ message: "You can't create more events on the VIP plan" });
        }
        break;
      case 'standard':
        if (user.OrganizedEvents.length > 3) {
          return res.status(401).json({ message: "You can't create more events on the Standard plan" });
        }
        break;
    } 
    const newEvent = await new Event({ ...req.body, Owner: req.user._id }).save();
    await User.findByIdAndUpdate(req.user._id, { $push: { OrganizedEvents: { event: newEvent._id } } });
    res.status(201).json(newEvent);
  } catch (error) {
    res.status(500).json({ message: 'Error while creating event', error: error.message });
  }
});

export const getAllEvents = asyncHandler(async (req, res) => {
    try {
        const events = await Event.find();
        if (!events) {
            return res.status(404).json({ message: 'No events found' });
        }
        res.status(200).json(events);
    } catch (error) {
        res.status(500).json({ message: 'Error while fetching events', error: error.message });
    }
});

export const getEventById = asyncHandler(async (req, res) => {
    try {
        const id = req.params.id;
        const event = await Event.findById(id);
        if (!event) {
            return res.status(404).json({ message: 'Event not found' });
        }
        res.status(200).json(event);
    } catch (error) {
        res.status(500).json({ message: 'Error while fetching event', error: error.message });
    }
});

export const updateEvent = asyncHandler(async (req, res) => {
  try {
    const id = req.params.id;
    const updates = req.body;
    const event = await Event.findById(id);
    if (!event) {
      return res.status(404).json({ message: 'Event not found' });
    }
    const updatedEvent = await Event.findByIdAndUpdate(id, updates, { 
      new: true,
      runValidators: true,
    });
    res.status(200).json(event);
  } catch (error) {
    res.status(500).json({ message: 'Error while updating event', error: error.message });
  }
});


export const getEventbyuserID = asyncHandler(async(req,res)=>{
  try {
    const id = req.params.id;
    const user = await User.findById(id);
    console.log(user)
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    if(user.isActive != true){
      return res.status(403).json({message:"User is not Activated yet"})
    }
    
    if (user.OrganizedEvents.length == 0) {
      return res.status(404).json({ message: "User has not created any events"});
    }
    const events = [];

    for (const organizedEvent of user.OrganizedEvents) {
      const event = await Event.findById(organizedEvent.event);
      if (event) {
        events.push(event);
      }
    }

    return res.status(200).json(events);  }
  catch(error){
    return res.status(500).json({message:"internal server error"})
  }
})

export const deleteEvent = asyncHandler(async (req, res) => {
    try {
        const id = req.params.id;
        const event = await Event.findByIdAndDelete(id);
        if (!event) {
            return res.status(404).json({ message: 'Event not found' });
        }
        res.status(200).json({ message: 'Event deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Error while deleting event', error: error.message });
    }
});


export const getEventAttendeeTypeCounts = async (req,res) => {
  try{
    const eventAttendeeTypeCounts = await Event.getAttendeeTypeCounts();
    res.json(eventAttendeeTypeCounts);
  }
  catch(error)
  {
    res.status(500).json({message:"Error while fetching the event attendee type counts"})
  }
};

export const NextEventDate = async (req,res)=> {
  try{
    const currentEventId = req.params.eventId;
    const nextEventDate = await Event.getNextEventDate(currentEventId);
    res.json({ nextEventDate });
  }
  catch(error){res.status(500).json({message:"Error While Fetching the next event date", error:error.message})}
};
export const getLastEventRemainingTasks = async (req, res) => {
  try {
    const lastEvent = await Event.findOne({}, {}, { sort: { 'createdAt': -1 } }).populate('tasks');
    
    const overallAccomplishment = lastEvent.calculateOverallAccomplishment();
    
    const remainingTasks = lastEvent.tasks.filter(task => task.status !== 'Completed');
    const remainingTaskTitles = remainingTasks.map(task => task.title);

    const tagCounts = remainingTasks.reduce((acc, task) => { 
      acc[task.tag] = (acc[task.tag] || 0) + 1;
      return acc;
    }, {});

    const totalRemainingTasks = remainingTasks.length;

    const tagPercentages = {};
    for (const tag in tagCounts) {
      tagPercentages[tag] = ((tagCounts[tag] / totalRemainingTasks) * 100).toFixed(2); 
    }

    const totalTimeOfAccomplishment = remainingTasks.reduce((total, task) => {
      const weeksSinceStart = moment().diff(moment(task.start), 'weeks');
      return total + weeksSinceStart;
    }, 0);


    res.json({ 
      overallAccomplishment: `${overallAccomplishment.toFixed(2)}%`,
      remainingTasksTitles: remainingTaskTitles,

      remainingTasks: {
        total: totalRemainingTasks,
        tags: tagPercentages,
        totalTimeOfAccomplishmentInWeeks: totalTimeOfAccomplishment
      }
    });
  } catch (error) {
    res.status(500).json({ message: "Error fetching remaining tasks", error });
  }
};

export const number_attendences = async (req,res)=> {
  const event = req.params.eventId

  const total = await User.countDocuments({ attendedEvents : {$exists:true , $not:{$size:0}}});
  const classification = await User.find({attandences : {$exists:true}})
  res.json({total:total,list:classification})
}
