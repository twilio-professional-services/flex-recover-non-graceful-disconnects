## Pre-Requisites
* An active Twilio account with Flex provisioned. Refer to the [Flex Quickstart](https://www.twilio.com/docs/flex/quickstart/flex-basics#sign-up-for-or-sign-in-to-twilio-and-create-a-new-flex-project") to create one.
* npm version 5.0.0 or later installed (type `npm -v` in your terminal to check)
* Node.js version 12 or later installed (type `node -v` in your terminal to check)
* [Twilio CLI](https://www.twilio.com/docs/twilio-cli/quickstart#install-twilio-cli) along with the [Flex CLI Plugin](https://www.twilio.com/docs/twilio-cli/plugins#available-plugins) and the [Serverless Plugin](https://www.twilio.com/docs/twilio-cli/plugins#available-plugins). Run the following commands to install them:
  
  ```bash
  # Install the Twilio CLI
  npm install twilio-cli -g
  # Install the Serverless and Flex as Plugins
  twilio plugins:install @twilio-labs/plugin-serverless
  twilio plugins:install @twilio-labs/plugin-flex
  ```

## Twilio Serverless Functions and Assets
Some of the following setup steps will require Serverless Functions URLs, so we will deploy the Twilio Serverless Functions before proceeding with the remaining steps.

### Environment Variables
Login to your Twilio Console and capture the following account settings for use in serverless function environment variables:

| Variable Name | Description |
| :---------------- | :-------------------- |
| WORKSPACE_SID     | Your Flex Task Assignment workspace SID. Find this in the [TaskRouter Workspaces](https://www.twilio.com/console/taskrouter/workspaces) page. |
| SYNC_SERVICE_SID  | Your Sync "Default Service" SID. Find this in the [Sync Services](https://www.twilio.com/console/sync/services) page.

### Setup
1. Clone this repo to your local development environment
1. Change to the `serverless/recover-non-graceful-disconnects` directory and install the dependencies
    ```bash
    cd serverless/recover-non-graceful-disconnects

    npm install
    ```
1. Copy the `.env.sample` file to `.env`
    ```bash
    cp .env.sample .env
    ```
1. Edit `.env` and replace the environment variables with the values you captured in the "Twilio Account Settings" section above
    ```bash
    WORKSPACE_SID=WSXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
    SYNC_SERVICE_SID=ISXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
    ```

### Deploy
1. Verify your Twilio CLI is using the Twilio Flex account you want to test with. Run the following command and note which Twilio account has `Active` as `true`
    ```bash
    twilio profiles:list
    ```
1. If you need to change the active Twilio account, run the following command with the desired profile name
    ```bash
    twilio profiles:use PROFILE
    ```
1. If you do not yet have a Twilio CLI profile for the desired Twilio Flex account, run the following command to connect to that account and give it your desired profile name
    ```bash
    twilio profiles:create --profile=PROFILE
    ```
1. With your desired Twilio Flex account profile active in the Twilio CLI, change to the `serverless/recover-non-graceful-disconnects` directory and deploy the Twilio Serverless Functions and Assets
    ```bash
    cd serverless/recover-non-graceful-disconnects

    twilio serverless:deploy
    ```
1. When the deployment completes, copy the following Deployment Details that will be used in subsequent setup and configuration steps
    * `Domain`
    * `Functions` URL that ends in `/conference-status-handler`

## Twilio Account Configuration
This section outlines the required configuration in your Twilio Flex account for this sample solution to operate as intended. Login to your [Twilio Console](https://www.twilio.com/console) and follow the steps in each section below.

### TaskRouter TaskQueues
1. Navigate to TaskRouter -> Workspaces -> Flex Task Assignment -> Task Queues
1. Create a new TaskQueue called "Recovery Ping" that will handle 'ping' tasks for validating if an agent is reachable
    1. For the "Queue Expression" use the following:
        * `1 == 1`
        * This ensures any worker is eligible to receive calls in this queue. We will use Workflow worker expressions to only target the worker we're looking to validate is reachable.
    1. Leave all other configuration fields at their default values

### TaskRouter Workflows
1. Navigate to TaskRouter -> Workspaces -> Flex Task Assignment -> Workflows
2. Create a new Workflow called "Recovery Ping"
    1. Set the Task Reservation Timeout to 15 seconds (to minimize time spent waiting for an agent's UI to respond to a ping)
    1. Add a Filter named "Ping Disconnected Agent"
        1. Set the "Matching Tasks" expression to:
            * `disconnectedWorkerSid != null && recoveryAttemptFailed == false`
        1. Under the "Routing Step", set the following:
            * Task Queue to `Recovery Ping`
            * Known Worker to `Worker SID`
            * Task Field with Worker SID to `task.disconnectedWorkerSid`
            * Leave all other fields at their default values (no need for a timeout, as it will default to the task's TTL)
    1. TODO: Make a fallback mechanism to reach any available agent. Complex because the ping task is a different Task Channel. So need a means to find someone who genuinely has zero calls (and this has a clear race condition). Might be non-feasible, and might be better to just re-enqueue customer call at this point - and trust the staffing capacity

  TODO: Screenshots for workflows


## Twilio Flex Plugins
This section will go through the steps to prepare the Flex plugins in this sample solution for use in your development environment and deployment to your Flex account.

### Plugin Description


1. Navigate to the `plugin-recover-non-graceful-call-disconnects` directory, install dependencies, copy the `env.sample` and `public/appConfig.example.js` files
    ```bash
    cd ../../plugin-recover-non-graceful-call-disconnects

    npm install

    cp .env.sample .env

    cp public/appConfig.example.js public/appConfig.js
    ```
1. Edit the `.env` file and populate `REACT_APP_SERVERLESS_DOMAIN` with the Domain value you copied in the Serverless Functions Deploy section above
    ```bash
    REACT_APP_SERVERLESS_DOMAIN=recover-non-graceful-call-disconnects-1234-dev.twil.io
    ```

### Development

1. Navigate to `plugin-recover-non-graceful-call-disconnects` and start the plugin
    ```bash
    twilio flex:plugins:start
    ```

Once you login to Flex running on your local dev environment at `localhost:3000`, the Flex UI will load. At that point you are ready to test and further develop the Flex plugins.

### Deploy
Once you are happy with your plugin, you have to deploy then release the plugin for it to take affect on Twilio hosted Flex.

1. Verify your Twilio CLI is using the Twilio Flex account you want to test with. Run the following command and note which Twilio account has `Active` as `true`
    ```bash
    twilio profiles:list
    ```
1. If you need to change the active Twilio account, run the following command with the desired profile name
    ```bash
    twilio profiles:use PROFILE
    ```
1. Navigate to the `plugin-recover-non-graceful-call-disconnects` directory and deploy the plugin
    ```bash
    cd ../plugin-recover-non-graceful-call-disconnects

    twilio flex:plugins:deploy --major --changelog "Notes for this version" --description "Functionality of the plugin"
    ```
1. Create a release to enable the newly deployed plugin (the URL to use will be returned from the prior command)

After you've deployed and released your plugin, you can confirm it is enabled in the Flex Admin Plugins dashboard at https://flex.twilio.com/admin/plugins.

For more details on deploying your plugin, refer to the [Flex plugin deploy and release guide](https://www.twilio.com/docs/flex/developer/plugins/cli/deploy-and-release).

Note: Common packages like `React`, `ReactDOM`, `Redux` and `ReactRedux` are not bundled with the build because they are treated as external dependencies so the plugin will depend on Flex to provide them globally.

## Testing
Once the Twilio Serverless Functions and Assets are deployed, the account configurations are complete, and the plugin is either running in your local development environment or in your hosted Flex instance, you are ready to test the solution.