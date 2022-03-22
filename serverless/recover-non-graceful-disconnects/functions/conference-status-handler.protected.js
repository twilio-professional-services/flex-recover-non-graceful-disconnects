const Twilio = require("twilio");

/**
 * This function serves as our conference status callback handler.
 * It reacts to participant-leave events, and - if the participant who left is
 * deemed to be the agent - we assume this is a non-graceful disconnect.
 *
 * Also reacts to participant-modify events, amnd makes sure to UNDO any over-zealous
 * setting of endConferenceOnExit=true, that Flex does out of the box.
 * 
 * TODO: Put dialpad ConferenceMonitor logic in here too - to manipulate endConferenceOnExit
 * as participants join and leave
 *
 * NOTE: For detecting who the agent is, we use a Sync Map - which our Flex Plugin
 * will populate - to remove the need to make expensive REST API calls to Taskrouter.
 * In a real-world scenario, we would recommend using your own backend services to
 * maintain and access this call/conference state (for scalability reasons).
 *
 * In this scenario, we play an announcement to the remaining conference participants,
 * and invoke another function to ping the agent via a 'stealth' taskrouter task.
 *
 * Upon that ping task being accepted, we then enqueue the customer call as a new task,
 * which Taskrouter will fast-track back to the agent via Known Agent Routing.
 *
 * See https://www.twilio.com/docs/voice/twiml/conference#attributes-statusCallback
 * @param {*} context
 * @param {*} event
 * @param {*} callback
 * @returns
 */
exports.handler = async function (context, event, callback) {
  const {
    ACCOUNT_SID,
    AUTH_TOKEN,
    DOMAIN_NAME,
    WORKSPACE_SID,
    SYNC_SERVICE_SID,
    RECOVERY_PING_WORKFLOW_SID,
  } = context;
  const twilioClient = Twilio(ACCOUNT_SID, AUTH_TOKEN);
  const conferenceService = require(Runtime.getFunctions()[
    "services/conference"
  ].path);
  const syncService = require(Runtime.getFunctions()["services/sync-map"].path);
  const taskService = require(Runtime.getFunctions()["services/task"].path);

  const ANNOUNCEMENT_PATH_CONNECTION_TO_AGENT_LOST =
    "connection-interrupted.mp3";

  const {
    CallSid: callSid,
    ConferenceSid: conferenceSid,
    StatusCallbackEvent: statusCallbackEvent,
    Reason: eventReason,
    EndConferenceOnExit: eventEndConferenceOnExit
  } = event;


  // TODO: Minimize use of global Sync Map (not scalable)
  console.debug(`'${statusCallbackEvent}' event for ${conferenceSid}`);

  //Object.keys(event).forEach(prop => console.debug(`[${statusCallbackEvent}] event.${prop}: `, event[prop]));


  // Object.keys(event).forEach((key) => console.debug(`${key}: ${event[key]}`));
  // Global sync map is used by the conference status handler to find the worker associated with
  // a conference - in determining when a worker leaves non-gracefully
  const globalSyncMapName = `Global.ActiveConferences`;

  let globalSyncMapItem = await syncService.getMapItem(
    SYNC_SERVICE_SID,
    globalSyncMapName,
    conferenceSid
  );

  if (!globalSyncMapItem) {
    // Nothing in the Sync Map for this conference
    // NOTE: Handler removes the Sync Map entry upon conference-end (see below)
    return callback(null, {});
  }

  const globalActiveConference = globalSyncMapItem.data || {};
  const {
    taskSid,
    taskAttributes,
    taskWorkflowSid,
    customerCallSid,
    workers
  } = globalActiveConference;




  if (statusCallbackEvent === "conference-end") {
    // Clean up the Sync Map item on conference end - no longer of use
    console.debug(`Conference ended with reason: '${eventReason}'`);

    await syncService.deleteMapItem(
        SYNC_SERVICE_SID,
        globalSyncMapName,
        conferenceSid
      );

    return callback(null, {});
  }

  // Bail out early if it's not an event we care about
  if (
    statusCallbackEvent !== "participant-leave" &&
    //statusCallbackEvent !== "participant-join" && 
    statusCallbackEvent !== "participant-modify" 
    
  ) {
    return callback(null, {});
  }

  /*
   * PARTICIPANT-MODIFY
   */
  if (statusCallbackEvent === "participant-modify") {
    // We're purely interested in undoing any Flex OOTB manipulation of endConferenceOnExit.
    // For purposes of this agent disconnect use case, we care about worker only, and ensuring
    // their endConferenceOnExit flag is false (to ensure others get to hang out in conference together
    // whenever agent drops unexpectedly)
    // The ONLY time we want endConferenceOnExit to actually be true (at the time of writing) is for the customer
    // participant (unless we explicitly override it to false for certain scenarios - like when pulling the customer
    // out of an old conference, into a new one)
    const workerThatWasModified = workers ? workers.find((w) => w.workerCallSid === callSid) : undefined;
    if (workerThatWasModified && customerCallSid) {
      console.debug(`Worker participant ${callSid} was modified and customer call still active. endConferenceOnExit: ${eventEndConferenceOnExit}`);
      if (eventEndConferenceOnExit == "true") {
        // TODO: Special logic if we don't want this behavior for certain calls/tasks
        console.debug(
          `Worker participant ${callSid} has an UNEXPECTED endConferenceOnExit value of '${eventEndConferenceOnExit}'. Undoing this...`
        );
        await conferenceService.setEndConferenceOnExit(
          conferenceSid,
          callSid,
          false
        );
      } else {
        console.debug(
          `Worker participant ${callSid} wasn't modified in any way we care about. Ignoring`
        );
      }
    } else {
      console.debug(
        `Non-agent participant ${callSid} was modified. Don't care!`
      );
    }
    return callback(null, {});
  }



  /**
   * PARTICIPANT-LEAVE
   */


  const didCustomerLeave = customerCallSid && customerCallSid === callSid;
  const workerCount = workers ? workers.length : 0;
  const workerThatLeft = workers ? workers.find((w) => w.workerCallSid === callSid) : undefined;

  if (didCustomerLeave) {
    // Clear down the customer details from state model, as we only run the reconnect logic if the customer is on the 
    // conference! Not for agent-to-agent or agent-to-3rd-party
    const syncMapItemData = {
      ...globalActiveConference,
      customerCallSid: null
    };
  
    await syncService.updateMapItem(
        SYNC_SERVICE_SID,
        globalSyncMapName,
        conferenceSid,
        syncMapItemData
      );
  
    return callback(null, {});
  }

  if (!workerThatLeft) {
    // We don't need to do anything unless it's an agent who disconnects non-gracefully
    // NOTE: Graceful terminations via Hangup, will clear out the worker from the state model
    console.debug(`No record of this call in our list of workers, so either not a worker, or they left gracefully`);
    return callback(null, {});
  }

  console.debug(`Agent left non-gracefully`);

  // Update the sync map (remove the disconnected worker now that we know about them)
  const newWorkers = workers.filter((w) => w.workerSid !== workerThatLeft.workerSid);
  const syncMapItemData = {
    ...globalActiveConference,
    workers: [...newWorkers]
  };

  await syncService.updateMapItem(
      SYNC_SERVICE_SID,
      globalSyncMapName,
      conferenceSid,
      syncMapItemData
    );  


  if (!customerCallSid) {
    // We don't care about reconnect logic - if the customer's no longer on the conference
    console.debug(`No customer on conference anymore, so ignoring reconnect logic`);
    return callback(null, {});    
  }

  // If the conference has more than one worker, then we don't need to execute our non-graceful logic
  // since there's another worker there to service the customer.
  if (workerCount > 1) {
    console.debug(
      `Conference still has ${workerCount-1} worker participants, so no need to engage recovery logic here!`
    );
    return callback(null, {});
  }

  // Go grab the conference and double-check it's not ended already (sometimes participant-leave events
  // come before conference-end, sometimes after, so go to the source just to be sure)
  // TODO: There may be improvements coming to participant-leave - that might include detail that alludes to 
  // to the reason the participant left (i.e. might not need this lookup)
  const conference = await conferenceService.fetchConference(
    conferenceSid
  );

  if (conference && conference.status === "completed") {
    console.debug(
      `Conference has ended with reason: '${conference.reasonConferenceEnded}. State will be deleted once conference-end is received`
    );
    return callback(null, {});
  }

  /*
   * BEYOND THIS POINT = NON-GRACEFUL WORKER DISCONNECT
   */
  console.debug(`This was the last worker on the conference => Engaging recovery logic...`);

  // Inform all remaining conference participants of what's happening
  const fullAnnouncementPath = `https://${DOMAIN_NAME}/${ANNOUNCEMENT_PATH_CONNECTION_TO_AGENT_LOST}`;
  await conferenceService.makeConferenceAnnouncement(
    conferenceSid,
    fullAnnouncementPath
  );

  // TODO: Make sure endConferenceOnExit is set appropriately for remaining participants - to avoid anyone being left alone when someone else drops
  // TODO: Evaluate if we even need to. E.g. if call drops from 3 to 2 participants (and agent is gone), do we even need to set the 3rd party to 
  // true? Worst case - vehicle remains in conf alone while reconnect happens.
  //updateEndConferenceOnExitFlags();

  const disconnectedTime = new Date().toISOString();
  
  const parsedAttributes = JSON.parse(taskAttributes);

  // Update the task attributes for Flex to use if/when the agent recovers from the disconnection
  // (and also for reporting!)
  const disconnectedTaskAttributes = {
    ...parsedAttributes,
    disconnectedTime,
    conversations: {
      ...parsedAttributes.conversations,
      followed_by: "Reconnect Agent"
    }
  }

  await taskService.updateTask(WORKSPACE_SID, taskSid, { attributes: JSON.stringify(disconnectedTaskAttributes) });

  // Create the ping task.
  // Once worker recovers from whatever system issue caused the diconnect (e.g. page refresh), the ping
  // task will be accepted, and our workflow event callback URL will perform the necessary logic to
  // reconnect the customer with the agent.
  // If worker doesn't respond to the ping task within 15 sec timeout (configurable below_), our workflow event
  // callback URL will engage when the task.canceled event fires.
  // See https://www.twilio.com/docs/taskrouter/api/task#create-a-task-resource
  // TODO: Get that timeout behavior tested!
  const newTaskAttributes = {
    ...parsedAttributes,
    disconnectedTaskSid: taskSid,
    disconnectedTaskWorkflowSid: taskWorkflowSid,
    disconnectedWorkerSid: workerThatLeft.workerSid,
    disconnectedWorkerName: workerThatLeft.workerName,
    disconnectedCallSid: workerThatLeft.workerCallSid,
    disconnectedConferenceSid: conferenceSid,
    disconnectedTime
  };

  const timeout = 15;
  const priority = 1000;
  console.debug(
    "Creating ping task to ensure worker is reachable before taking customer out of current conference"
  );
  await taskService.createTask(
    WORKSPACE_SID,
    RECOVERY_PING_WORKFLOW_SID,
    newTaskAttributes,
    timeout,
    priority
  );

  callback(null, {});
};
