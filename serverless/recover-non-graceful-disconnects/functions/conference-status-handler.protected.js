const Twilio = require("twilio");

/**
 * This function serves as our conference status callback handler.
 * It reacts to participant-leave events, and - if the participant who left is
 * deemed to be the agent - we assume this is a non-graceful disconnect.
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
  const conferenceService = require(Runtime.getFunctions()["services/conference"]
    .path);
  const syncService = require(Runtime.getFunctions()["services/sync-map"].path);
  const taskService = require(Runtime.getFunctions()["services/task"].path);

  const ANNOUNCEMENT_PATH_CONNECTION_TO_AGENT_LOST =
    "connection-to-agent-lost.mp3";

  const {
    CallSid: eventCallSid,
    ConferenceSid: eventConferenceSid,
    StatusCallbackEvent: statusCallbackEvent,
    Reason: reason
  } = event;

  const syncMapSuffix = "ActiveConferences";
  const syncMapName = `Global.${syncMapSuffix}`;
  // TODO: Minimize use of global Sync Map (not scalable)

  console.log(`'${statusCallbackEvent}' event for ${eventConferenceSid}`);

  //Object.keys(event).forEach((key) => console.debug(`${key}: ${event[key]}`));

  if (statusCallbackEvent === "conference-end") {
    // Clean up the Sync Map entry - no longer of use
    console.log(`Conference ended with reason: '${reason}'`);
    await syncService.deleteMapItem(SYNC_SERVICE_SID, syncMapName, eventConferenceSid)
    return callback(null, {});
  }

  // All we care about is participant-leave
  if (statusCallbackEvent !== "participant-leave") {
    return callback(null, {});
  }

  const globalSyncMapItem = await syncService.getMapItem(
    SYNC_SERVICE_SID,
    syncMapName,
    eventConferenceSid
  );

  if (!globalSyncMapItem) {
    // Nothing in the Sync Map for this conference
    // NOTE: Handler removes the Sync Map entry upon conference-end (see above)
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

  const didCustomerLeave = customerCallSid && customerCallSid === eventCallSid;
  const didAgentLeave = workerCallSid && workerCallSid === eventCallSid;

  if (didCustomerLeave) {
    // Might need to use this information later
    console.log(`Customer left conference. This is as good as conference-end, but just log it for now`);
    return callback(null, {});
  }

  if (!didAgentLeave) {
    // We don't need to do anything unless it's the agent who disconnects non-gracefully
    console.log(`Wasn't the agent who left, so irrelevant`);
    return callback(null, {});
  }

  // Did agent leave by hanging up?
  if (wasGracefulWorkerDisconnect) {
    console.log(`Agent left by clicking Hangup. Graceful. Nothing more to do`);
    return callback(null, {});
  }

  // Go grab the conference and double-check it's not ended already (sometimes participant-leave events 
  // come before conference-end, sometimes after, so go to the source just to be sure)
  const conference = await conferenceService.fetchConference(eventConferenceSid);
  
  if (conference && conference.status === "completed") {
    console.log(`Conference has ended with reason: '${conference.reasonConferenceEnded}`);
    return callback(null, {});
  }

  console.log(`Agent left non-gracefully. Engaging recovery logic...`);

  // Inform all conference participants of what's happening
  const fullAnnouncementPath = `https://${DOMAIN_NAME}/${ANNOUNCEMENT_PATH_CONNECTION_TO_AGENT_LOST}`;
  await conferenceService.makeConferenceAnnouncement(
    eventConferenceSid,
    fullAnnouncementPath
  );

  // Update the sync map
  const syncMapItemData = {
    ...globalActiveConference,
    workerDisconnected: true,
    disconnectedTime: new Date().toISOString(),
  };

  
  await syncService.updateMapItem(
      SYNC_SERVICE_SID,
      syncMapName,
      eventConferenceSid,
      syncMapItemData
    );

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

  const timeout = 60;
  const priority = 1000;
  console.log(
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
