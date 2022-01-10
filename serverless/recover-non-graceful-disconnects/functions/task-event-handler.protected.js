const Twilio = require("twilio");

/**
 * This function serves as our Taskrouter event callback handler.
 * It reacts to certain events for the recovery ping task, in order to
 * orchestrate when to enqueue the customer back to the recovered agent.
 *
 * Upon that ping task being completed, we enqueue the customer call as a new task,
 * which Taskrouter will fast-track back to the agent via Known Agent Routing.
 *
 * If the ping task times out or is rejected somehow, then it's assumed the agent is not
 * recovered, and a new task is enqueued to the same queue - for next available agent to
 * grab.
 *
 * TODO: Add plugin logic to cater to reconnect tasks arriving to another agent
 *
 * See https://www.twilio.com/docs/taskrouter/api/event/reference#event-callbacks
 * @param {*} context
 * @param {*} event
 * @param {*} callback
 * @returns
 */
exports.handler = async function (context, event, callback) {
  const { ACCOUNT_SID, AUTH_TOKEN, WORKSPACE_SID, RECOVERY_PING_WORKFLOW_SID } =
    context;
  const twilioClient = Twilio(ACCOUNT_SID, AUTH_TOKEN);
  const task = require(Runtime.getFunctions()["services/task"].path);

  //const ANNOUNCEMENT_PATH_CONNECTION_TO_AGENT_LOST = 'connection-to-agent-lost.mp3';

  const response = new Twilio.Response();
  response.appendHeader("Access-Control-Allow-Origin", "*");
  response.appendHeader("Access-Control-Allow-Methods", "OPTIONS POST GET");
  response.appendHeader("Access-Control-Allow-Headers", "Content-Type");
  response.appendHeader("Content-Type", "application/json");

  const {
    EventType: eventType,
    EventDescription: eventDescription,
    TaskSid: taskSid,
    TaskAttributes: taskAttributes,
    TaskCanceledReason: taskCanceledReason,
    WorkflowSid: workflowSid,
  } = event;

  const syncMapSuffix = "ActiveConferences";
  const syncMapName = `Global.${syncMapSuffix}`;
  // TODO: Minimize use of global Sync Map (not scalable)

  console.log(
    `'${eventType}' event for ${taskSid}, with description '${eventDescription}'`
  );

  // We only care about recovery ping tasks
  if (workflowSid != RECOVERY_PING_WORKFLOW_SID) {
    console.log(`Not a recovery ping task`);
    return callback(null, {});
  }

  // We only care about ping tasks that are cleanly completed, or that hit their TTL and are thus canceled
  // TODO: Test the TTL/timeout stuff
  if (eventType !== "task.completed" && eventType !== "task.canceled") {
    console.log(`Irrelevant event!`);
    return callback(null, {});
  }

  // Make sure we prep for the customer dropping out of multiparty conference (i.e. don't end it!)
  // TODO: Keep conference going if multiple parties
  // console.log(
  //   `Setting endConferenceOnExit to ${endConferenceOnExit} for participant ${participantCallSid} in conference ${conferenceSid}`
  // );
  // await conference.updateConferenceParticipant(conferenceSid, participantCallSid, { endConferenceOnExit });

  // Go ahead and enqueue new call task

  // First, we need the attributes from the original task
  // Despite the docs, TaskAttributes are not part of the callback event
  // TODO: Use state model instead of Taskrouter's REST API
  const pingTask = await task.getTask(WORKSPACE_SID, taskSid);
  const originalAttributes = JSON.parse(pingTask.attributes);

  // If the ping task was successful (aka completed), then route to agent
  // If the ping task was unsuccessful (aka canceled), then route to queue
  // Clear the existing conference details
  const newAttributes = {
    ...originalAttributes,
    targetWorkerSid:
      eventType === "task.completed"
        ? taskAttributes.disconnectedWorkerSid
        : undefined,
    isReconnect: true,
    conference: {},
  };

  const priority = 1000;
  await task.enqueueCallTask(
    originalAttributes.call_sid,
    originalAttributes.disconnectedTaskWorkflowSid,
    newAttributes,
    priority
  );

  response.setBody({
    success: true,
  });

  callback(null, response);
};
