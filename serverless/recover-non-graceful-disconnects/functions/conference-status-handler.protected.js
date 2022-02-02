const Twilio = require("twilio");

/**
 * This function serves as our conference status callback handler.
 * It reacts to participant-leave events, and - if the participant who left is
 * deemed to be the agent - we assume this is a non-graceful disconnect.
 *
 * Also reacts to participant-modify events, amnd makes sure to UNDO any over-zealous
 * setting of endConferenceOnExit=true, that Flex does out of the box.
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
    CallSid: eventCallSid,
    ConferenceSid: eventConferenceSid,
    StatusCallbackEvent: statusCallbackEvent,
    EndConferenceOnExit: eventEndConferenceOnExit,
    Reason: eventReason,
  } = event;

  const syncMapSuffix = "ActiveConferences";
  const globalSyncMapName = `Global.${syncMapSuffix}`;

  const globalSyncMapItem = await syncService.getMapItem(
    SYNC_SERVICE_SID,
    globalSyncMapName,
    eventConferenceSid
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
    workerSid,
    customerCallSid,
    workerCallSid,
    workerName,
    wasGracefulWorkerDisconnect,
  } = globalActiveConference;

  const parsedAttributes = JSON.parse(taskAttributes);

  const workerSyncMapName = `Worker.${workerSid}.${syncMapSuffix}`;
  // TODO: Minimize use of global Sync Map (not scalable)

  console.debug(`'${statusCallbackEvent}' event for ${eventConferenceSid}`);

  // Object.keys(event).forEach((key) => console.debug(`${key}: ${event[key]}`));

  if (statusCallbackEvent === "conference-end") {
    // Clean up the Sync Map entries - no longer of use
    console.debug(`Conference ended with reason: '${eventReason}'`);

    await Promise.all([
      syncService.deleteMapItem(
        SYNC_SERVICE_SID,
        globalSyncMapName,
        eventConferenceSid
      ),
      syncService.deleteMapItem(
        SYNC_SERVICE_SID,
        workerSyncMapName,
        eventConferenceSid
      ),
    ]);

    return callback(null, {});
  }

  // Bail out early if it's not an event we care about
  if (
    statusCallbackEvent !== "participant-leave" &&
    statusCallbackEvent !== "participant-modify" // EDIT: Buggy/doesn't work
  ) {
    return callback(null, {});
  }

  if (statusCallbackEvent === "participant-modify") {
    // EDIT: Not working due to Flex Orchestration bug (see README)

    // We're purely interested in undoing any Flex OOTB manipulation of endConferenceOnExit.
    // For purposes of this agent disconnect use case, we care about worker only, and ensuring
    // their endConferenceOnExit flag is false (to ensure others get to hang out in conference together
    // whenever agent drops unexpectedly)
    // The ONLY time we want endConferenceOnExit to actually be true (at the time of writing) is for the customer
    // participant (unless we explicitly override it to false for certain scenarios - like when pulling the customer
    // out of an old conference, into a new one)
    const wasAgentModified = workerCallSid && workerCallSid === eventCallSid;
    if (wasAgentModified) {
      console.debug(`Agent participant ${eventCallSid} was modified`);
      if (eventEndConferenceOnExit === true) {
        // TODO: Special logic if we don't want this behavior for certain calls/tasks
        console.debug(
          `Agent participant ${eventCallSid} has an UNEXPECTED endConferenceOnExit value of 'true'. Undoing this...`
        );
        console.debug(
          `Setting endConferenceOnExit to 'false' for participant ${eventCallSid} in conference ${eventConferenceSid}`
        );
        const serviceResponse = await conferenceService.setEndConferenceOnExit(
          eventConferenceSid,
          eventCallSid,
          false
        );
      } else {
        console.debug(
          `Agent participant ${eventCallSid} wasn't modified in any way we care about. Ignoring`
        );
      }
    } else {
      console.debug(
        `Non-agent participant ${eventCallSid} was modified. Don't care!`
      );
    }
    return callback(null, {});
  }

  /**
   * Everything here on is for participant-leave
   */

  const didCustomerLeave = customerCallSid && customerCallSid === eventCallSid;
  const didAgentLeave = workerCallSid && workerCallSid === eventCallSid;

  if (didCustomerLeave) {
    // Might need to use this information later
    console.debug(
      `Customer left conference. This is as good as conference-end, but just log it for now`
    );
    return callback(null, {});
  }

  if (!didAgentLeave) {
    // We don't need to do anything unless it's the agent who disconnects non-gracefully
    console.debug(`Wasn't the agent who left, so irrelevant`);
    return callback(null, {});
  }

  // Did agent leave by hanging up?
  if (wasGracefulWorkerDisconnect) {
    console.debug(
      `Agent left by clicking Hangup. Graceful. Nothing more to do`
    );
    return callback(null, {});
  }

  // Go grab the conference and double-check it's not ended already (sometimes participant-leave events
  // come before conference-end, sometimes after, so go to the source just to be sure)
  const conference = await conferenceService.fetchConference(
    eventConferenceSid
  );

  if (conference && conference.status === "completed") {
    console.debug(
      `Conference has ended with reason: '${conference.reasonConferenceEnded}`
    );
    return callback(null, {});
  }

  console.debug(`Agent left non-gracefully. Engaging recovery logic...`);

  // Inform all conference participants of what's happening
  const fullAnnouncementPath = `https://${DOMAIN_NAME}/${ANNOUNCEMENT_PATH_CONNECTION_TO_AGENT_LOST}`;
  await conferenceService.makeConferenceAnnouncement(
    eventConferenceSid,
    fullAnnouncementPath
  );

  // Make sure endConferenceOnExit is set appropriately for remaining participants - to avoid anyone being left alone when someone else drops
  // TODO: Evaluate if we even need to. E.g. if call drops from 3 to 2 participants (and agent is gone), do we even need to set the 3rd party to 
  // true? Worst case - vehicle remains in conf alone while reconnect haoppens.
  //updateEndConferenceOnExitFlags();

  // Update the sync map
  const syncMapItemData = {
    ...globalActiveConference,
    workerDisconnected: true,
    disconnectedTime: new Date().toISOString(),
  };

  await Promise.all([
    syncService.updateMapItem(
      SYNC_SERVICE_SID,
      globalSyncMapName,
      eventConferenceSid,
      syncMapItemData
    ),
    syncService.updateMapItem(
      SYNC_SERVICE_SID,
      workerSyncMapName,
      eventConferenceSid,
      syncMapItemData
    ),
  ]);
  
  // Update the task attributes for Flex to use if/when the agent recovers from the disconnection
  // (and also for reporting!)
  const disconnectedTaskAttributes = {
    ...parsedAttributes,
    disconnectedTime: syncMapItemData.disconnectedTime,
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
  // If worker doesn't respond to the ping task within 15 sec timeout, our workflow event
  // callback URL will engage when the task.canceled event fires.
  // See https://www.twilio.com/docs/taskrouter/api/task#create-a-task-resource
  // TODO: Get that timeout behavior tested!
  const newTaskAttributes = {
    ...parsedAttributes,
    disconnectedTaskSid: taskSid,
    disconnectedTaskWorkflowSid: taskWorkflowSid,
    disconnectedWorkerSid: workerSid,
    disconnectedWorkerName: workerName,
    disconnectedCallSid: eventCallSid,
    disconnectedConferenceSid: eventConferenceSid,
    disconnectedTime: syncMapItemData.disconnectedTime,
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
