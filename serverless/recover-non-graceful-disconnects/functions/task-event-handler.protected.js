const Twilio = require("twilio");

/**
 * This function serves as our Taskrouter event callback handler.
 * It reacts to certain events for the recovery ping task, in order to
 * orchestrate when to enqueue the customer back to the recovered agent.
 *
 * Upon that ping task being accepted, we enqueue the customer call as a new task,
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
  const taskService = require(Runtime.getFunctions()["services/task"].path);
  const callService = require(Runtime.getFunctions()["services/call"].path);

  const response = new Twilio.Response();
  response.appendHeader("Access-Control-Allow-Origin", "*");
  response.appendHeader("Access-Control-Allow-Methods", "OPTIONS POST GET");
  response.appendHeader("Access-Control-Allow-Headers", "Content-Type");
  response.appendHeader("Content-Type", "application/json");

  
  const payload = event[0] ? event[0]["data"]["payload"] : undefined;

  if (!payload) {
    console.warn('event[0] not present', event);
    return callback(null, {});
  }
  
  const eventType = payload["eventtype"];
  const taskSid = payload["task_sid"];
  const taskChannel = payload["task_channel_unique_name"];
  const taskAttributesString = payload["task_attributes"];
  const taskAttributes = JSON.parse(taskAttributesString);
  const workflowSid = payload["workflow_sid"];

  console.debug(`'${eventType}' event for '${taskChannel}' task ${taskSid}`);

  // Skip irrelevant events/tasks
  if (
    !isRelevantPingTaskEvent(context, event) &&
    !isRelevantVoiceTaskEvent(event)
  ) {
    console.debug(`Irrelevant event!`);
    return callback(null, {});
  }

  console.debug(`event_type: ${eventType}`);
  console.debug(`task_sid: ${taskSid}`);
  console.debug(`task_channel_unique_name: ${taskChannel}`);
  console.debug(`task_attributes: ${taskAttributesString}`);
  console.debug(`workflow_sid: ${workflowSid}`);

  // Make sure we prep for the customer dropping out of multiparty conference (i.e. don't end it!)
  // TODO: Keep conference going if multiple parties
  // console.debug(
  //   `Setting endConferenceOnExit to ${endConferenceOnExit} for participant ${participantCallSid} in conference ${conferenceSid}`
  // );
  // await conference.updateConferenceParticipant(conferenceSid, participantCallSid, { endConferenceOnExit });

  if (isRelevantPingTaskEvent(context, event)) {
    // We know ping task was accepted or canceled

    if (eventType === 'reservation.accepted') {
      // Complete the ping task
      taskService.updateTask(WORKSPACE_SID, taskSid, {
        assignmentStatus: "completed",
      });

      // Update the original task to say ping was successful (use attributes that were propagated via the ping task)
      const attributesForDisconnectedTask = JSON.parse(taskAttributesString);
      const disconnectedTaskSid = attributesForDisconnectedTask.disconnectedTaskSid;
      const newAttributesForDisconnectedTask = {
        ...attributesForDisconnectedTask,
        wasPingSuccessful: true
      }
      await taskService.updateTask(WORKSPACE_SID, disconnectedTaskSid, {
        attributes: JSON.stringify(newAttributesForDisconnectedTask)
      });

    }

    // So go ahead and enqueue new reconnect call task for the disconnected customer

    // First, we need the attributes from the original call task
    // Since these were propagated onto the recovery ping task, we have them

    // If the ping task was successful (aka completed), then route to agent
    // If the ping task was unsuccessful (aka canceled), then route to queue
    // Clear the existing conference details from attributes (might not be needed, but seems wise)
    const newAttributes = {
      ...taskAttributes,
      targetWorkerSid:
        eventType === "reservation.accepted"
          ? taskAttributes.disconnectedWorkerSid
          : undefined,
      isReconnect: true,
      conference: {},
      conversations: {
        ...taskAttributes.conversations,
        conversation_id: taskAttributes.conversations && taskAttributes.conversations.conversation_id ? taskAttributes.conversations.conversation_id : taskAttributes.disconnectedTaskSid
      }
    };

    const callSid = newAttributes.call_sid;
    const workflowSid = newAttributes.disconnectedTaskWorkflowSid;

    // Make sure call is in right status to be updated (customer might've dropped)
    const serviceResponse = await callService.fetchCall(callSid);
    if (
      !serviceResponse.callResponse ||
      serviceResponse.callResponse.status !== "in-progress"
    ) {
      console.warn(
        `Call ${callSid} either not found, or not 'in-progress'. Not enqueuing reconnect task.`,
        serviceResponse
      );
      return callback(null, {});
    }

    const priority = 1000;
    await callService.enqueueCallTask(
      callSid,
      workflowSid,
      newAttributes,
      priority
    );


  }

  if (isRelevantVoiceTaskEvent(event)) {
    // The reconnect voice task entered the task queue.
    // This is the optimal point to complete the original voice task that's assigned to the disconnected agent
    // as it minimizes (arguably elimates) risk of another voice call reservation being made against that agent.
    // e.g. if we completed the task within Flex upon receipt of the ping task, there may not yet be a reconnect task
    // sitting in queue for the agent, and so any other pending voice task could be reserved to the agent.
    // The reconnect task is always a higher priority task, so as long as it's in the queue - it will be the first task
    // to be reserved to the agent.

    // Check if original task isn't already completed first (since it's possible that this event could fire more than
    // once - e.g. if task falls back to an overflow queue)
    // TODO: Pull task state in from our state model vs TR REST API
    const originalTaskSid = taskAttributes.disconnectedTaskSid;
    const originalTask = await taskService.getTask(
      WORKSPACE_SID,
      originalTaskSid
    );
    if (originalTask && originalTask.assignmentStatus === "wrapping") {
      console.debug(
        `Completing original disconnected call task with SID ${originalTaskSid}`
      );

      await taskService.updateTask(WORKSPACE_SID, originalTaskSid, {
        assignmentStatus: "completed",
        reason:
          "Non-graceful agent disconnection resulted in a new reconnect task"
      });
    }
  }

  response.setBody({
    success: true,
  });

  callback(null, response);
};

/**
 * For ping tasks, we only care about those that are cleanly completed, or that hit their TTL and are thus canceled
 */
function isRelevantPingTaskEvent(context, event) {
  const payload = event[0]["data"]["payload"];
  const eventType = payload["eventtype"];
  const workflowSid = payload["workflow_sid"];

  return (
    workflowSid == context.RECOVERY_PING_WORKFLOW_SID &&
    (eventType === "reservation.accepted" || eventType === "task.canceled")
  );
}

/**
 * For voice tasks, we only care about reconnect tasks that hit the queue
 */
function isRelevantVoiceTaskEvent(event) {
  const payload = event[0]["data"]["payload"];
  const eventType = payload["eventtype"];
  const taskChannel = payload["task_channel_unique_name"];
  const taskAttributesString = payload["task_attributes"];
  const taskAttributes = JSON.parse(taskAttributesString);

  return (
    taskChannel === "voice" &&
    eventType === "task-queue.entered" &&
    taskAttributes.isReconnect
  );
}
