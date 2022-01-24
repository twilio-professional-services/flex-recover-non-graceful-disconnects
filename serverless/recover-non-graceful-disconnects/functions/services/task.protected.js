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
  console.debug(`Created task ${task.sid}`);
};

const getTask = async (workspaceSid, taskSid) => {
  console.debug(`Fetching ${taskSid} from Taskrouter`);
  try {
    const task = await twilioClient.taskrouter
      .workspaces(workspaceSid)
      .tasks(taskSid)
      .fetch();
    return task;
  } catch (error) {
    console.debug(`Unable to find ${taskSid}`);
    return undefined;
  }
};

const updateTask = async (workspaceSid, taskSid, payload) => {
  console.debug(
    `Updating task ${taskSid} with payload ${JSON.stringify(payload)}`
  );

  try {
    const task = await twilioClient.taskrouter
      .workspaces(workspaceSid)
      .tasks(taskSid)
      .update(payload);
    console.debug(
      `Updated task ${taskSid} successfully`
    );
    return task;
  } catch (error) {
    console.debug(`Error updating task ${taskSid}`, error);
    return undefined;
  }

};

module.exports = {
  createTask,
  getTask,
  updateTask,
};
