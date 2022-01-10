const createTask = async (
  workspaceSid,
  workflowSid,
  attributes,
  timeout,
  priority
) => {
  const task = await twilioClient.taskrouter
    .workspaces(workspaceSid)
    .tasks.create({
      workflowSid,
      attributes: JSON.stringify(attributes),
      timeout,
      priority,
    });
  console.log(`Created task ${task.sid}`);
};

const getTask = async (workspaceSid, taskSid) => {
  console.log(`Fetching ${taskSid} from Taskrouter`);
  try {
    const task = await twilioClient.taskrouter
      .workspaces(workspaceSid)
      .tasks(taskSid)
      .fetch();
    return task;
  } catch (error) {
    console.log(`Unable to find ${taskSid}`);
    return undefined;
  }
};

const enqueueCallTask = async (callSid, workflowSid, attributes, priority) => {
  const twiml = new Twilio.twiml.VoiceResponse();
  twiml
    .enqueue({
      workflowSid,
    })
    .task(
      {
        priority,
      },
      JSON.stringify(attributes)
    );

  console.log(`Updating call ${callSid} with new TwiML ${twiml.toString()}`);
  try {
    // TODO: Put in /services
    await twilioClient.calls(callSid).update({ twiml: twiml.toString() });
  } catch (error) {
    console.error("Failed to update call", error);
  }
};

module.exports = {
  createTask,
  getTask,
  enqueueCallTask,
};
