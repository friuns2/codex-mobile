# APP SERVER DOCUMENTATION

Документ основан на исходниках [openai/codex](https://github.com/openai/codex) (app-server protocol).

The checked-in contract was refreshed on 2026-08-11 from the locally installed `codex-cli 0.147.0`, including experimental methods:

```sh
codex app-server generate-json-schema --experimental --out documentation/app-server-schemas/json
codex app-server generate-ts --experimental --out documentation/app-server-schemas/typescript
```

## Локальная материализация схем

Все схемы выгружены из upstream codegen (включая experimental) в:

- `app-server-schemas/json`
- `app-server-schemas/typescript`

- Bundle: [codex_app_server_protocol.schemas.json](app-server-schemas/json/codex_app_server_protocol.schemas.json)
- Root index: [ClientRequest.json](app-server-schemas/json/ClientRequest.json), [ServerRequest.json](app-server-schemas/json/ServerRequest.json), [ServerNotification.json](app-server-schemas/json/ServerNotification.json)

## Client -> Server Methods (полный список)

| Method                             | Params Schema                                                                                                | Response Schema                                                                                                  | Experimental                       | UI-зона                                     |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- | ---------------------------------- | ------------------------------------------- |
| `initialize`                       | [InitializeParams](app-server-schemas/json/v1/InitializeParams.json)                                         | [InitializeResponse](app-server-schemas/json/v1/InitializeResponse.json)                                         | `stable`                           | Контролы и настройки (авторизация/аккаунт)  |
| `thread/start`                     | [ThreadStartParams](app-server-schemas/json/v2/ThreadStartParams.json)                                       | [ThreadStartResponse](app-server-schemas/json/v2/ThreadStartResponse.json)                                       | `stable`                           | Навигация и загрузка сессий                 |
| `thread/resume`                    | [ThreadResumeParams](app-server-schemas/json/v2/ThreadResumeParams.json)                                     | [ThreadResumeResponse](app-server-schemas/json/v2/ThreadResumeResponse.json)                                     | `stable`                           | Навигация и загрузка сессий                 |
| `thread/fork`                      | [ThreadForkParams](app-server-schemas/json/v2/ThreadForkParams.json)                                         | [ThreadForkResponse](app-server-schemas/json/v2/ThreadForkResponse.json)                                         | `stable`                           | Навигация и загрузка сессий                 |
| `thread/archive`                   | [ThreadArchiveParams](app-server-schemas/json/v2/ThreadArchiveParams.json)                                   | [ThreadArchiveResponse](app-server-schemas/json/v2/ThreadArchiveResponse.json)                                   | `stable`                           | Контролы сессий                             |
| `thread/name/set`                  | [ThreadSetNameParams](app-server-schemas/json/v2/ThreadSetNameParams.json)                                   | [ThreadSetNameResponse](app-server-schemas/json/v2/ThreadSetNameResponse.json)                                   | `stable`                           | Контролы сессий                             |
| `thread/unarchive`                 | [ThreadUnarchiveParams](app-server-schemas/json/v2/ThreadUnarchiveParams.json)                               | [ThreadUnarchiveResponse](app-server-schemas/json/v2/ThreadUnarchiveResponse.json)                               | `stable`                           | Контролы сессий                             |
| `thread/compact/start`             | [ThreadCompactStartParams](app-server-schemas/json/v2/ThreadCompactStartParams.json)                         | [ThreadCompactStartResponse](app-server-schemas/json/v2/ThreadCompactStartResponse.json)                         | `stable`                           | Контролы сессий                             |
| `thread/backgroundTerminals/clean` | [ThreadBackgroundTerminalsCleanParams](app-server-schemas/json/v2/ThreadBackgroundTerminalsCleanParams.json) | [ThreadBackgroundTerminalsCleanResponse](app-server-schemas/json/v2/ThreadBackgroundTerminalsCleanResponse.json) | `thread/backgroundTerminals/clean` | Контролы сессий                             |
| `thread/rollback`                  | [ThreadRollbackParams](app-server-schemas/json/v2/ThreadRollbackParams.json)                                 | [ThreadRollbackResponse](app-server-schemas/json/v2/ThreadRollbackResponse.json)                                 | `stable`                           | Контролы сессий                             |
| `thread/list`                      | [ThreadListParams](app-server-schemas/json/v2/ThreadListParams.json)                                         | [ThreadListResponse](app-server-schemas/json/v2/ThreadListResponse.json)                                         | `stable`                           | Навигация и загрузка сессий                 |
| `thread/loaded/list`               | [ThreadLoadedListParams](app-server-schemas/json/v2/ThreadLoadedListParams.json)                             | [ThreadLoadedListResponse](app-server-schemas/json/v2/ThreadLoadedListResponse.json)                             | `stable`                           | Навигация и загрузка сессий                 |
| `thread/read`                      | [ThreadReadParams](app-server-schemas/json/v2/ThreadReadParams.json)                                         | [ThreadReadResponse](app-server-schemas/json/v2/ThreadReadResponse.json)                                         | `stable`                           | Навигация и загрузка сессий                 |
| `skills/list`                      | [SkillsListParams](app-server-schemas/json/v2/SkillsListParams.json)                                         | [SkillsListResponse](app-server-schemas/json/v2/SkillsListResponse.json)                                         | `stable`                           | Контролы и настройки (системная интеграция) |
| `skills/remote/read`               | [SkillsRemoteReadParams](app-server-schemas/json/v2/SkillsRemoteReadParams.json)                             | [SkillsRemoteReadResponse](app-server-schemas/json/v2/SkillsRemoteReadResponse.json)                             | `stable`                           | Контролы и настройки (системная интеграция) |
| `skills/remote/write`              | [SkillsRemoteWriteParams](app-server-schemas/json/v2/SkillsRemoteWriteParams.json)                           | [SkillsRemoteWriteResponse](app-server-schemas/json/v2/SkillsRemoteWriteResponse.json)                           | `stable`                           | Контролы и настройки (системная интеграция) |
| `app/list`                         | [AppsListParams](app-server-schemas/json/v2/AppsListParams.json)                                             | [AppsListResponse](app-server-schemas/json/v2/AppsListResponse.json)                                             | `stable`                           | Контролы и настройки (системная интеграция) |
| `skills/config/write`              | [SkillsConfigWriteParams](app-server-schemas/json/v2/SkillsConfigWriteParams.json)                           | [SkillsConfigWriteResponse](app-server-schemas/json/v2/SkillsConfigWriteResponse.json)                           | `stable`                           | Контролы и настройки (системная интеграция) |
| `turn/start`                       | [TurnStartParams](app-server-schemas/json/v2/TurnStartParams.json)                                           | [TurnStartResponse](app-server-schemas/json/v2/TurnStartResponse.json)                                           | `stable`                           | Контентная часть (динамические сообщения)   |
| `turn/steer`                       | [TurnSteerParams](app-server-schemas/json/v2/TurnSteerParams.json)                                           | [TurnSteerResponse](app-server-schemas/json/v2/TurnSteerResponse.json)                                           | `stable`                           | Контентная часть (динамические сообщения)   |
| `turn/interrupt`                   | [TurnInterruptParams](app-server-schemas/json/v2/TurnInterruptParams.json)                                   | [TurnInterruptResponse](app-server-schemas/json/v2/TurnInterruptResponse.json)                                   | `stable`                           | Контентная часть (динамические сообщения)   |
| `review/start`                     | [ReviewStartParams](app-server-schemas/json/v2/ReviewStartParams.json)                                       | [ReviewStartResponse](app-server-schemas/json/v2/ReviewStartResponse.json)                                       | `stable`                           | Контентная часть (динамические сообщения)   |
| `model/list`                       | [ModelListParams](app-server-schemas/json/v2/ModelListParams.json)                                           | [ModelListResponse](app-server-schemas/json/v2/ModelListResponse.json)                                           | `stable`                           | Контролы и настройки (системная интеграция) |
| `experimentalFeature/list`         | [ExperimentalFeatureListParams](app-server-schemas/json/v2/ExperimentalFeatureListParams.json)               | [ExperimentalFeatureListResponse](app-server-schemas/json/v2/ExperimentalFeatureListResponse.json)               | `stable`                           | Контролы и настройки (системная интеграция) |
| `collaborationMode/list`           | [CollaborationModeListParams](app-server-schemas/json/v2/CollaborationModeListParams.json)                   | [CollaborationModeListResponse](app-server-schemas/json/v2/CollaborationModeListResponse.json)                   | `stable`                           | Контролы и настройки (системная интеграция) |
| `mock/experimentalMethod`          | [MockExperimentalMethodParams](app-server-schemas/json/v2/MockExperimentalMethodParams.json)                 | [MockExperimentalMethodResponse](app-server-schemas/json/v2/MockExperimentalMethodResponse.json)                 | `stable`                           | Контентная часть (статическая/сервисная)    |
| `mcpServer/oauth/login`            | [McpServerOauthLoginParams](app-server-schemas/json/v2/McpServerOauthLoginParams.json)                       | [McpServerOauthLoginResponse](app-server-schemas/json/v2/McpServerOauthLoginResponse.json)                       | `stable`                           | Контролы и настройки (авторизация/аккаунт)  |
| `config/mcpServer/reload`          |                                                                                                              | [McpServerRefreshResponse](app-server-schemas/json/v2/McpServerRefreshResponse.json)                             | `stable`                           | Контролы и настройки (системная интеграция) |
| `mcpServerStatus/list`             | [ListMcpServerStatusParams](app-server-schemas/json/v2/ListMcpServerStatusParams.json)                       | [ListMcpServerStatusResponse](app-server-schemas/json/v2/ListMcpServerStatusResponse.json)                       | `stable`                           | Контролы и настройки (системная интеграция) |
| `account/login/start`              | [LoginAccountParams](app-server-schemas/json/v2/LoginAccountParams.json)                                     | [LoginAccountResponse](app-server-schemas/json/v2/LoginAccountResponse.json)                                     | `stable`                           | Контролы и настройки (авторизация/аккаунт)  |
| `account/login/cancel`             | [CancelLoginAccountParams](app-server-schemas/json/v2/CancelLoginAccountParams.json)                         | [CancelLoginAccountResponse](app-server-schemas/json/v2/CancelLoginAccountResponse.json)                         | `stable`                           | Контролы и настройки (авторизация/аккаунт)  |
| `account/logout`                   |                                                                                                              | [LogoutAccountResponse](app-server-schemas/json/v2/LogoutAccountResponse.json)                                   | `stable`                           | Контролы и настройки (авторизация/аккаунт)  |
| `account/rateLimits/read`          |                                                                                                              | [GetAccountRateLimitsResponse](app-server-schemas/json/v2/GetAccountRateLimitsResponse.json)                     | `stable`                           | Контролы и настройки (авторизация/аккаунт)  |
| `feedback/upload`                  | [FeedbackUploadParams](app-server-schemas/json/v2/FeedbackUploadParams.json)                                 | [FeedbackUploadResponse](app-server-schemas/json/v2/FeedbackUploadResponse.json)                                 | `stable`                           | Контролы и настройки (feedback/диагностика) |
| `command/exec`                     | [CommandExecParams](app-server-schemas/json/v2/CommandExecParams.json)                                       | [CommandExecResponse](app-server-schemas/json/v2/CommandExecResponse.json)                                       | `stable`                           | Контролы выполнения инструментов            |
| `config/read`                      | [ConfigReadParams](app-server-schemas/json/v2/ConfigReadParams.json)                                         | [ConfigReadResponse](app-server-schemas/json/v2/ConfigReadResponse.json)                                         | `stable`                           | Контролы и настройки (системная интеграция) |
| `config/value/write`               | [ConfigValueWriteParams](app-server-schemas/json/v2/ConfigValueWriteParams.json)                             | [ConfigWriteResponse](app-server-schemas/json/v2/ConfigWriteResponse.json)                                       | `stable`                           | Контролы и настройки (системная интеграция) |
| `config/batchWrite`                | [ConfigBatchWriteParams](app-server-schemas/json/v2/ConfigBatchWriteParams.json)                             | [ConfigWriteResponse](app-server-schemas/json/v2/ConfigWriteResponse.json)                                       | `stable`                           | Контролы и настройки (системная интеграция) |
| `configRequirements/read`          |                                                                                                              | [ConfigRequirementsReadResponse](app-server-schemas/json/v2/ConfigRequirementsReadResponse.json)                 | `stable`                           | Контролы и настройки (системная интеграция) |
| `account/read`                     | [GetAccountParams](app-server-schemas/json/v2/GetAccountParams.json)                                         | [GetAccountResponse](app-server-schemas/json/v2/GetAccountResponse.json)                                         | `stable`                           | Контролы и настройки (авторизация/аккаунт)  |
| `newConversation`                  | [NewConversationParams](app-server-schemas/json/v1/NewConversationParams.json)                               | [NewConversationResponse](app-server-schemas/json/v1/NewConversationResponse.json)                               | `stable`                           | Навигация и загрузка сессий                 |
| `getConversationSummary`           | [GetConversationSummaryParams](app-server-schemas/json/v1/GetConversationSummaryParams.json)                 | [GetConversationSummaryResponse](app-server-schemas/json/v1/GetConversationSummaryResponse.json)                 | `stable`                           | Навигация и загрузка сессий                 |
| `listConversations`                | [ListConversationsParams](app-server-schemas/json/v1/ListConversationsParams.json)                           | [ListConversationsResponse](app-server-schemas/json/v1/ListConversationsResponse.json)                           | `stable`                           | Навигация и загрузка сессий                 |
| `resumeConversation`               | [ResumeConversationParams](app-server-schemas/json/v1/ResumeConversationParams.json)                         | [ResumeConversationResponse](app-server-schemas/json/v1/ResumeConversationResponse.json)                         | `stable`                           | Навигация и загрузка сессий                 |
| `forkConversation`                 | [ForkConversationParams](app-server-schemas/json/v1/ForkConversationParams.json)                             | [ForkConversationResponse](app-server-schemas/json/v1/ForkConversationResponse.json)                             | `stable`                           | Навигация и загрузка сессий                 |
| `archiveConversation`              | [ArchiveConversationParams](app-server-schemas/json/v1/ArchiveConversationParams.json)                       | [ArchiveConversationResponse](app-server-schemas/json/v1/ArchiveConversationResponse.json)                       | `stable`                           | Контролы сессий                             |
| `sendUserMessage`                  | [SendUserMessageParams](app-server-schemas/json/v1/SendUserMessageParams.json)                               | [SendUserMessageResponse](app-server-schemas/json/v1/SendUserMessageResponse.json)                               | `stable`                           | Контентная часть (динамические сообщения)   |
| `sendUserTurn`                     | [SendUserTurnParams](app-server-schemas/json/v1/SendUserTurnParams.json)                                     | [SendUserTurnResponse](app-server-schemas/json/v1/SendUserTurnResponse.json)                                     | `stable`                           | Контентная часть (динамические сообщения)   |
| `interruptConversation`            | [InterruptConversationParams](app-server-schemas/json/v1/InterruptConversationParams.json)                   | [InterruptConversationResponse](app-server-schemas/json/v1/InterruptConversationResponse.json)                   | `stable`                           | Контентная часть (динамические сообщения)   |
| `addConversationListener`          | [AddConversationListenerParams](app-server-schemas/json/v1/AddConversationListenerParams.json)               | [AddConversationSubscriptionResponse](app-server-schemas/json/v1/AddConversationSubscriptionResponse.json)       | `stable`                           | Контролы сессий                             |
| `removeConversationListener`       | [RemoveConversationListenerParams](app-server-schemas/json/v1/RemoveConversationListenerParams.json)         | [RemoveConversationSubscriptionResponse](app-server-schemas/json/v1/RemoveConversationSubscriptionResponse.json) | `stable`                           | Контролы сессий                             |
| `gitDiffToRemote`                  | [GitDiffToRemoteParams](app-server-schemas/json/v1/GitDiffToRemoteParams.json)                               | [GitDiffToRemoteResponse](app-server-schemas/json/v1/GitDiffToRemoteResponse.json)                               | `stable`                           | Контролы выполнения инструментов            |
| `loginApiKey`                      | [LoginApiKeyParams](app-server-schemas/json/v1/LoginApiKeyParams.json)                                       | [LoginApiKeyResponse](app-server-schemas/json/v1/LoginApiKeyResponse.json)                                       | `stable`                           | Контролы и настройки (авторизация/аккаунт)  |
| `loginChatGpt`                     |                                                                                                              | [LoginChatGptResponse](app-server-schemas/json/v1/LoginChatGptResponse.json)                                     | `stable`                           | Контролы и настройки (авторизация/аккаунт)  |
| `cancelLoginChatGpt`               | [CancelLoginChatGptParams](app-server-schemas/json/v1/CancelLoginChatGptParams.json)                         | [CancelLoginChatGptResponse](app-server-schemas/json/v1/CancelLoginChatGptResponse.json)                         | `stable`                           | Контентная часть (статическая/сервисная)    |
| `logoutChatGpt`                    |                                                                                                              | [LogoutChatGptResponse](app-server-schemas/json/v1/LogoutChatGptResponse.json)                                   | `stable`                           | Контролы и настройки (авторизация/аккаунт)  |
| `getAuthStatus`                    | [GetAuthStatusParams](app-server-schemas/json/v1/GetAuthStatusParams.json)                                   | [GetAuthStatusResponse](app-server-schemas/json/v1/GetAuthStatusResponse.json)                                   | `stable`                           | Контролы и настройки (авторизация/аккаунт)  |
| `getUserSavedConfig`               |                                                                                                              | [GetUserSavedConfigResponse](app-server-schemas/json/v1/GetUserSavedConfigResponse.json)                         | `stable`                           | Контролы и настройки (системная интеграция) |
| `setDefaultModel`                  | [SetDefaultModelParams](app-server-schemas/json/v1/SetDefaultModelParams.json)                               | [SetDefaultModelResponse](app-server-schemas/json/v1/SetDefaultModelResponse.json)                               | `stable`                           | Контролы и настройки (системная интеграция) |
| `getUserAgent`                     |                                                                                                              | [GetUserAgentResponse](app-server-schemas/json/v1/GetUserAgentResponse.json)                                     | `stable`                           | Контролы и настройки (авторизация/аккаунт)  |
| `userInfo`                         |                                                                                                              | [UserInfoResponse](app-server-schemas/json/v1/UserInfoResponse.json)                                             | `stable`                           | Контролы и настройки (авторизация/аккаунт)  |
| `fuzzyFileSearch`                  | [FuzzyFileSearchParams](app-server-schemas/json/FuzzyFileSearchParams.json)                                  | [FuzzyFileSearchResponse](app-server-schemas/json/FuzzyFileSearchResponse.json)                                  | `stable`                           | Контролы и настройки (системная интеграция) |
| `fuzzyFileSearch/sessionStart`     | [FuzzyFileSearchSessionStartParams](app-server-schemas/json/FuzzyFileSearchSessionStartParams.json)          | [FuzzyFileSearchSessionStartResponse](app-server-schemas/json/FuzzyFileSearchSessionStartResponse.json)          | `fuzzyFileSearch/sessionStart`     | Контролы и настройки (системная интеграция) |
| `fuzzyFileSearch/sessionUpdate`    | [FuzzyFileSearchSessionUpdateParams](app-server-schemas/json/FuzzyFileSearchSessionUpdateParams.json)        | [FuzzyFileSearchSessionUpdateResponse](app-server-schemas/json/FuzzyFileSearchSessionUpdateResponse.json)        | `fuzzyFileSearch/sessionUpdate`    | Контролы и настройки (системная интеграция) |
| `fuzzyFileSearch/sessionStop`      | [FuzzyFileSearchSessionStopParams](app-server-schemas/json/FuzzyFileSearchSessionStopParams.json)            | [FuzzyFileSearchSessionStopResponse](app-server-schemas/json/FuzzyFileSearchSessionStopResponse.json)            | `fuzzyFileSearch/sessionStop`      | Контролы и настройки (системная интеграция) |
| `execOneOffCommand`                | [ExecOneOffCommandParams](app-server-schemas/json/v1/ExecOneOffCommandParams.json)                           | [ExecOneOffCommandResponse](app-server-schemas/json/v1/ExecOneOffCommandResponse.json)                           | `stable`                           | Контролы выполнения инструментов            |

## Server -> Client Requests (полный список)

| Method                                  | Params Schema                                                                                               | Response Schema                                                                                                 | UI-зона                                    |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| `item/commandExecution/requestApproval` | [CommandExecutionRequestApprovalParams](app-server-schemas/json/CommandExecutionRequestApprovalParams.json) | [CommandExecutionRequestApprovalResponse](app-server-schemas/json/CommandExecutionRequestApprovalResponse.json) | Контролы выполнения инструментов           |
| `item/fileChange/requestApproval`       | [FileChangeRequestApprovalParams](app-server-schemas/json/FileChangeRequestApprovalParams.json)             | [FileChangeRequestApprovalResponse](app-server-schemas/json/FileChangeRequestApprovalResponse.json)             | Контролы выполнения инструментов           |
| `item/tool/requestUserInput`            | [ToolRequestUserInputParams](app-server-schemas/json/ToolRequestUserInputParams.json)                       | [ToolRequestUserInputResponse](app-server-schemas/json/ToolRequestUserInputResponse.json)                       | Контролы выполнения инструментов           |
| `item/tool/call`                        | [DynamicToolCallParams](app-server-schemas/json/DynamicToolCallParams.json)                                 | [DynamicToolCallResponse](app-server-schemas/json/DynamicToolCallResponse.json)                                 | Контролы выполнения инструментов           |
| `account/chatgptAuthTokens/refresh`     | [ChatgptAuthTokensRefreshParams](app-server-schemas/json/ChatgptAuthTokensRefreshParams.json)               | [ChatgptAuthTokensRefreshResponse](app-server-schemas/json/ChatgptAuthTokensRefreshResponse.json)               | Контролы и настройки (авторизация/аккаунт) |
| `applyPatchApproval`                    | [ApplyPatchApprovalParams](app-server-schemas/json/ApplyPatchApprovalParams.json)                           | [ApplyPatchApprovalResponse](app-server-schemas/json/ApplyPatchApprovalResponse.json)                           | Контролы выполнения инструментов           |
| `execCommandApproval`                   | [ExecCommandApprovalParams](app-server-schemas/json/ExecCommandApprovalParams.json)                         | [ExecCommandApprovalResponse](app-server-schemas/json/ExecCommandApprovalResponse.json)                         | Контролы выполнения инструментов           |

## Server Notifications (полный список)

| Method                                      | Payload Schema                                                                                                          | UI-зона                                     |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| `error`                                     | [ErrorNotification](app-server-schemas/json/v2/ErrorNotification.json)                                                  | Контентная часть (статическая/сервисная)    |
| `thread/started`                            | [ThreadStartedNotification](app-server-schemas/json/v2/ThreadStartedNotification.json)                                  | Контентная часть (статическая/сервисная)    |
| `thread/name/updated`                       | [ThreadNameUpdatedNotification](app-server-schemas/json/v2/ThreadNameUpdatedNotification.json)                          | Контентная часть (статическая/сервисная)    |
| `thread/tokenUsage/updated`                 | [ThreadTokenUsageUpdatedNotification](app-server-schemas/json/v2/ThreadTokenUsageUpdatedNotification.json)              | Контентная часть (статическая/сервисная)    |
| `turn/started`                              | [TurnStartedNotification](app-server-schemas/json/v2/TurnStartedNotification.json)                                      | Контентная часть (статическая/сервисная)    |
| `turn/completed`                            | [TurnCompletedNotification](app-server-schemas/json/v2/TurnCompletedNotification.json)                                  | Контентная часть (статическая/сервисная)    |
| `turn/diff/updated`                         | [TurnDiffUpdatedNotification](app-server-schemas/json/v2/TurnDiffUpdatedNotification.json)                              | Контентная часть (статическая/сервисная)    |
| `turn/plan/updated`                         | [TurnPlanUpdatedNotification](app-server-schemas/json/v2/TurnPlanUpdatedNotification.json)                              | Контентная часть (статическая/сервисная)    |
| `item/started`                              | [ItemStartedNotification](app-server-schemas/json/v2/ItemStartedNotification.json)                                      | Контролы выполнения инструментов            |
| `item/completed`                            | [ItemCompletedNotification](app-server-schemas/json/v2/ItemCompletedNotification.json)                                  | Контролы выполнения инструментов            |
| `rawResponseItem/completed`                 | [RawResponseItemCompletedNotification](app-server-schemas/json/v2/RawResponseItemCompletedNotification.json)            | Контентная часть (статическая/сервисная)    |
| `item/agentMessage/delta`                   | [AgentMessageDeltaNotification](app-server-schemas/json/v2/AgentMessageDeltaNotification.json)                          | Контролы выполнения инструментов            |
| `item/plan/delta`                           | [PlanDeltaNotification](app-server-schemas/json/v2/PlanDeltaNotification.json)                                          | Контролы выполнения инструментов            |
| `item/commandExecution/outputDelta`         | [CommandExecutionOutputDeltaNotification](app-server-schemas/json/v2/CommandExecutionOutputDeltaNotification.json)      | Контролы выполнения инструментов            |
| `item/commandExecution/terminalInteraction` | [TerminalInteractionNotification](app-server-schemas/json/v2/TerminalInteractionNotification.json)                      | Контролы выполнения инструментов            |
| `item/fileChange/outputDelta`               | [FileChangeOutputDeltaNotification](app-server-schemas/json/v2/FileChangeOutputDeltaNotification.json)                  | Контролы выполнения инструментов            |
| `item/mcpToolCall/progress`                 | [McpToolCallProgressNotification](app-server-schemas/json/v2/McpToolCallProgressNotification.json)                      | Контролы выполнения инструментов            |
| `mcpServer/oauthLogin/completed`            | [McpServerOauthLoginCompletedNotification](app-server-schemas/json/v2/McpServerOauthLoginCompletedNotification.json)    | Контролы и настройки (системная интеграция) |
| `account/updated`                           | [AccountUpdatedNotification](app-server-schemas/json/v2/AccountUpdatedNotification.json)                                | Контролы и настройки (авторизация/аккаунт)  |
| `account/rateLimits/updated`                | [AccountRateLimitsUpdatedNotification](app-server-schemas/json/v2/AccountRateLimitsUpdatedNotification.json)            | Контролы и настройки (авторизация/аккаунт)  |
| `app/list/updated`                          | [AppListUpdatedNotification](app-server-schemas/json/v2/AppListUpdatedNotification.json)                                | Контентная часть (статическая/сервисная)    |
| `item/reasoning/summaryTextDelta`           | [ReasoningSummaryTextDeltaNotification](app-server-schemas/json/v2/ReasoningSummaryTextDeltaNotification.json)          | Контролы выполнения инструментов            |
| `item/reasoning/summaryPartAdded`           | [ReasoningSummaryPartAddedNotification](app-server-schemas/json/v2/ReasoningSummaryPartAddedNotification.json)          | Контролы выполнения инструментов            |
| `item/reasoning/textDelta`                  | [ReasoningTextDeltaNotification](app-server-schemas/json/v2/ReasoningTextDeltaNotification.json)                        | Контролы выполнения инструментов            |
| `thread/compacted`                          | [ContextCompactedNotification](app-server-schemas/json/v2/ContextCompactedNotification.json)                            | Контентная часть (статическая/сервисная)    |
| `deprecationNotice`                         | [DeprecationNoticeNotification](app-server-schemas/json/v2/DeprecationNoticeNotification.json)                          | Контентная часть (статическая/сервисная)    |
| `configWarning`                             | [ConfigWarningNotification](app-server-schemas/json/v2/ConfigWarningNotification.json)                                  | Контентная часть (статическая/сервисная)    |
| `fuzzyFileSearch/sessionUpdated`            | [FuzzyFileSearchSessionUpdatedNotification](app-server-schemas/json/FuzzyFileSearchSessionUpdatedNotification.json)     | Контролы и настройки (системная интеграция) |
| `fuzzyFileSearch/sessionCompleted`          | [FuzzyFileSearchSessionCompletedNotification](app-server-schemas/json/FuzzyFileSearchSessionCompletedNotification.json) | Контролы и настройки (системная интеграция) |
| `windows/worldWritableWarning`              | [WindowsWorldWritableWarningNotification](app-server-schemas/json/v2/WindowsWorldWritableWarningNotification.json)      | Контентная часть (статическая/сервисная)    |
| `account/login/completed`                   | [AccountLoginCompletedNotification](app-server-schemas/json/v2/AccountLoginCompletedNotification.json)                  | Контролы и настройки (авторизация/аккаунт)  |
| `authStatusChange`                          | [AuthStatusChangeNotification](app-server-schemas/json/v1/AuthStatusChangeNotification.json)                            | Контентная часть (статическая/сервисная)    |
| `loginChatGptComplete`                      | [LoginChatGptCompleteNotification](app-server-schemas/json/v1/LoginChatGptCompleteNotification.json)                    | Контролы и настройки (авторизация/аккаунт)  |
| `sessionConfigured`                         | [SessionConfiguredNotification](app-server-schemas/json/v1/SessionConfiguredNotification.json)                          | Контентная часть (статическая/сервисная)    |

## Полный индекс materialized schema-файлов

### JSON Root

- [ApplyPatchApprovalParams.json](app-server-schemas/json/ApplyPatchApprovalParams.json)
- [ApplyPatchApprovalResponse.json](app-server-schemas/json/ApplyPatchApprovalResponse.json)
- [ChatgptAuthTokensRefreshParams.json](app-server-schemas/json/ChatgptAuthTokensRefreshParams.json)
- [ChatgptAuthTokensRefreshResponse.json](app-server-schemas/json/ChatgptAuthTokensRefreshResponse.json)
- [ClientNotification.json](app-server-schemas/json/ClientNotification.json)
- [ClientRequest.json](app-server-schemas/json/ClientRequest.json)
- [CommandExecutionRequestApprovalParams.json](app-server-schemas/json/CommandExecutionRequestApprovalParams.json)
- [CommandExecutionRequestApprovalResponse.json](app-server-schemas/json/CommandExecutionRequestApprovalResponse.json)
- [DynamicToolCallParams.json](app-server-schemas/json/DynamicToolCallParams.json)
- [DynamicToolCallResponse.json](app-server-schemas/json/DynamicToolCallResponse.json)
- [EventMsg.json](app-server-schemas/json/EventMsg.json)
- [ExecCommandApprovalParams.json](app-server-schemas/json/ExecCommandApprovalParams.json)
- [ExecCommandApprovalResponse.json](app-server-schemas/json/ExecCommandApprovalResponse.json)
- [FileChangeRequestApprovalParams.json](app-server-schemas/json/FileChangeRequestApprovalParams.json)
- [FileChangeRequestApprovalResponse.json](app-server-schemas/json/FileChangeRequestApprovalResponse.json)
- [FuzzyFileSearchParams.json](app-server-schemas/json/FuzzyFileSearchParams.json)
- [FuzzyFileSearchResponse.json](app-server-schemas/json/FuzzyFileSearchResponse.json)
- [FuzzyFileSearchSessionCompletedNotification.json](app-server-schemas/json/FuzzyFileSearchSessionCompletedNotification.json)
- [FuzzyFileSearchSessionStartParams.json](app-server-schemas/json/FuzzyFileSearchSessionStartParams.json)
- [FuzzyFileSearchSessionStartResponse.json](app-server-schemas/json/FuzzyFileSearchSessionStartResponse.json)
- [FuzzyFileSearchSessionStopParams.json](app-server-schemas/json/FuzzyFileSearchSessionStopParams.json)
- [FuzzyFileSearchSessionStopResponse.json](app-server-schemas/json/FuzzyFileSearchSessionStopResponse.json)
- [FuzzyFileSearchSessionUpdateParams.json](app-server-schemas/json/FuzzyFileSearchSessionUpdateParams.json)
- [FuzzyFileSearchSessionUpdateResponse.json](app-server-schemas/json/FuzzyFileSearchSessionUpdateResponse.json)
- [FuzzyFileSearchSessionUpdatedNotification.json](app-server-schemas/json/FuzzyFileSearchSessionUpdatedNotification.json)
- [JSONRPCError.json](app-server-schemas/json/JSONRPCError.json)
- [JSONRPCErrorError.json](app-server-schemas/json/JSONRPCErrorError.json)
- [JSONRPCMessage.json](app-server-schemas/json/JSONRPCMessage.json)
- [JSONRPCNotification.json](app-server-schemas/json/JSONRPCNotification.json)
- [JSONRPCRequest.json](app-server-schemas/json/JSONRPCRequest.json)
- [JSONRPCResponse.json](app-server-schemas/json/JSONRPCResponse.json)
- [RequestId.json](app-server-schemas/json/RequestId.json)
- [ServerNotification.json](app-server-schemas/json/ServerNotification.json)
- [ServerRequest.json](app-server-schemas/json/ServerRequest.json)
- [ToolRequestUserInputParams.json](app-server-schemas/json/ToolRequestUserInputParams.json)
- [ToolRequestUserInputResponse.json](app-server-schemas/json/ToolRequestUserInputResponse.json)
- [codex_app_server_protocol.schemas.json](app-server-schemas/json/codex_app_server_protocol.schemas.json)

### JSON v1

- [AddConversationListenerParams.json](app-server-schemas/json/v1/AddConversationListenerParams.json)
- [AddConversationSubscriptionResponse.json](app-server-schemas/json/v1/AddConversationSubscriptionResponse.json)
- [ArchiveConversationParams.json](app-server-schemas/json/v1/ArchiveConversationParams.json)
- [ArchiveConversationResponse.json](app-server-schemas/json/v1/ArchiveConversationResponse.json)
- [AuthStatusChangeNotification.json](app-server-schemas/json/v1/AuthStatusChangeNotification.json)
- [CancelLoginChatGptParams.json](app-server-schemas/json/v1/CancelLoginChatGptParams.json)
- [CancelLoginChatGptResponse.json](app-server-schemas/json/v1/CancelLoginChatGptResponse.json)
- [ExecOneOffCommandParams.json](app-server-schemas/json/v1/ExecOneOffCommandParams.json)
- [ExecOneOffCommandResponse.json](app-server-schemas/json/v1/ExecOneOffCommandResponse.json)
- [ForkConversationParams.json](app-server-schemas/json/v1/ForkConversationParams.json)
- [ForkConversationResponse.json](app-server-schemas/json/v1/ForkConversationResponse.json)
- [GetAuthStatusParams.json](app-server-schemas/json/v1/GetAuthStatusParams.json)
- [GetAuthStatusResponse.json](app-server-schemas/json/v1/GetAuthStatusResponse.json)
- [GetConversationSummaryParams.json](app-server-schemas/json/v1/GetConversationSummaryParams.json)
- [GetConversationSummaryResponse.json](app-server-schemas/json/v1/GetConversationSummaryResponse.json)
- [GetUserAgentResponse.json](app-server-schemas/json/v1/GetUserAgentResponse.json)
- [GetUserSavedConfigResponse.json](app-server-schemas/json/v1/GetUserSavedConfigResponse.json)
- [GitDiffToRemoteParams.json](app-server-schemas/json/v1/GitDiffToRemoteParams.json)
- [GitDiffToRemoteResponse.json](app-server-schemas/json/v1/GitDiffToRemoteResponse.json)
- [InitializeParams.json](app-server-schemas/json/v1/InitializeParams.json)
- [InitializeResponse.json](app-server-schemas/json/v1/InitializeResponse.json)
- [InterruptConversationParams.json](app-server-schemas/json/v1/InterruptConversationParams.json)
- [InterruptConversationResponse.json](app-server-schemas/json/v1/InterruptConversationResponse.json)
- [ListConversationsParams.json](app-server-schemas/json/v1/ListConversationsParams.json)
- [ListConversationsResponse.json](app-server-schemas/json/v1/ListConversationsResponse.json)
- [LoginApiKeyParams.json](app-server-schemas/json/v1/LoginApiKeyParams.json)
- [LoginApiKeyResponse.json](app-server-schemas/json/v1/LoginApiKeyResponse.json)
- [LoginChatGptCompleteNotification.json](app-server-schemas/json/v1/LoginChatGptCompleteNotification.json)
- [LoginChatGptResponse.json](app-server-schemas/json/v1/LoginChatGptResponse.json)
- [LogoutChatGptResponse.json](app-server-schemas/json/v1/LogoutChatGptResponse.json)
- [NewConversationParams.json](app-server-schemas/json/v1/NewConversationParams.json)
- [NewConversationResponse.json](app-server-schemas/json/v1/NewConversationResponse.json)
- [RemoveConversationListenerParams.json](app-server-schemas/json/v1/RemoveConversationListenerParams.json)
- [RemoveConversationSubscriptionResponse.json](app-server-schemas/json/v1/RemoveConversationSubscriptionResponse.json)
- [ResumeConversationParams.json](app-server-schemas/json/v1/ResumeConversationParams.json)
- [ResumeConversationResponse.json](app-server-schemas/json/v1/ResumeConversationResponse.json)
- [SendUserMessageParams.json](app-server-schemas/json/v1/SendUserMessageParams.json)
- [SendUserMessageResponse.json](app-server-schemas/json/v1/SendUserMessageResponse.json)
- [SendUserTurnParams.json](app-server-schemas/json/v1/SendUserTurnParams.json)
- [SendUserTurnResponse.json](app-server-schemas/json/v1/SendUserTurnResponse.json)
- [SessionConfiguredNotification.json](app-server-schemas/json/v1/SessionConfiguredNotification.json)
- [SetDefaultModelParams.json](app-server-schemas/json/v1/SetDefaultModelParams.json)
- [SetDefaultModelResponse.json](app-server-schemas/json/v1/SetDefaultModelResponse.json)
- [UserInfoResponse.json](app-server-schemas/json/v1/UserInfoResponse.json)

### JSON v2

- [AccountLoginCompletedNotification.json](app-server-schemas/json/v2/AccountLoginCompletedNotification.json)
- [AccountRateLimitsUpdatedNotification.json](app-server-schemas/json/v2/AccountRateLimitsUpdatedNotification.json)
- [AccountUpdatedNotification.json](app-server-schemas/json/v2/AccountUpdatedNotification.json)
- [AgentMessageDeltaNotification.json](app-server-schemas/json/v2/AgentMessageDeltaNotification.json)
- [AppListUpdatedNotification.json](app-server-schemas/json/v2/AppListUpdatedNotification.json)
- [AppsListParams.json](app-server-schemas/json/v2/AppsListParams.json)
- [AppsListResponse.json](app-server-schemas/json/v2/AppsListResponse.json)
- [CancelLoginAccountParams.json](app-server-schemas/json/v2/CancelLoginAccountParams.json)
- [CancelLoginAccountResponse.json](app-server-schemas/json/v2/CancelLoginAccountResponse.json)
- [CollaborationModeListParams.json](app-server-schemas/json/v2/CollaborationModeListParams.json)
- [CollaborationModeListResponse.json](app-server-schemas/json/v2/CollaborationModeListResponse.json)
- [CommandExecParams.json](app-server-schemas/json/v2/CommandExecParams.json)
- [CommandExecResponse.json](app-server-schemas/json/v2/CommandExecResponse.json)
- [CommandExecutionOutputDeltaNotification.json](app-server-schemas/json/v2/CommandExecutionOutputDeltaNotification.json)
- [ConfigBatchWriteParams.json](app-server-schemas/json/v2/ConfigBatchWriteParams.json)
- [ConfigReadParams.json](app-server-schemas/json/v2/ConfigReadParams.json)
- [ConfigReadResponse.json](app-server-schemas/json/v2/ConfigReadResponse.json)
- [ConfigRequirementsReadResponse.json](app-server-schemas/json/v2/ConfigRequirementsReadResponse.json)
- [ConfigValueWriteParams.json](app-server-schemas/json/v2/ConfigValueWriteParams.json)
- [ConfigWarningNotification.json](app-server-schemas/json/v2/ConfigWarningNotification.json)
- [ConfigWriteResponse.json](app-server-schemas/json/v2/ConfigWriteResponse.json)
- [ContextCompactedNotification.json](app-server-schemas/json/v2/ContextCompactedNotification.json)
- [DeprecationNoticeNotification.json](app-server-schemas/json/v2/DeprecationNoticeNotification.json)
- [ErrorNotification.json](app-server-schemas/json/v2/ErrorNotification.json)
- [ExperimentalFeatureListParams.json](app-server-schemas/json/v2/ExperimentalFeatureListParams.json)
- [ExperimentalFeatureListResponse.json](app-server-schemas/json/v2/ExperimentalFeatureListResponse.json)
- [FeedbackUploadParams.json](app-server-schemas/json/v2/FeedbackUploadParams.json)
- [FeedbackUploadResponse.json](app-server-schemas/json/v2/FeedbackUploadResponse.json)
- [FileChangeOutputDeltaNotification.json](app-server-schemas/json/v2/FileChangeOutputDeltaNotification.json)
- [GetAccountParams.json](app-server-schemas/json/v2/GetAccountParams.json)
- [GetAccountRateLimitsResponse.json](app-server-schemas/json/v2/GetAccountRateLimitsResponse.json)
- [GetAccountResponse.json](app-server-schemas/json/v2/GetAccountResponse.json)
- [ItemCompletedNotification.json](app-server-schemas/json/v2/ItemCompletedNotification.json)
- [ItemStartedNotification.json](app-server-schemas/json/v2/ItemStartedNotification.json)
- [ListMcpServerStatusParams.json](app-server-schemas/json/v2/ListMcpServerStatusParams.json)
- [ListMcpServerStatusResponse.json](app-server-schemas/json/v2/ListMcpServerStatusResponse.json)
- [LoginAccountParams.json](app-server-schemas/json/v2/LoginAccountParams.json)
- [LoginAccountResponse.json](app-server-schemas/json/v2/LoginAccountResponse.json)
- [LogoutAccountResponse.json](app-server-schemas/json/v2/LogoutAccountResponse.json)
- [McpServerOauthLoginCompletedNotification.json](app-server-schemas/json/v2/McpServerOauthLoginCompletedNotification.json)
- [McpServerOauthLoginParams.json](app-server-schemas/json/v2/McpServerOauthLoginParams.json)
- [McpServerOauthLoginResponse.json](app-server-schemas/json/v2/McpServerOauthLoginResponse.json)
- [McpServerRefreshResponse.json](app-server-schemas/json/v2/McpServerRefreshResponse.json)
- [McpToolCallProgressNotification.json](app-server-schemas/json/v2/McpToolCallProgressNotification.json)
- [MockExperimentalMethodParams.json](app-server-schemas/json/v2/MockExperimentalMethodParams.json)
- [MockExperimentalMethodResponse.json](app-server-schemas/json/v2/MockExperimentalMethodResponse.json)
- [ModelListParams.json](app-server-schemas/json/v2/ModelListParams.json)
- [ModelListResponse.json](app-server-schemas/json/v2/ModelListResponse.json)
- [PlanDeltaNotification.json](app-server-schemas/json/v2/PlanDeltaNotification.json)
- [RawResponseItemCompletedNotification.json](app-server-schemas/json/v2/RawResponseItemCompletedNotification.json)
- [ReasoningSummaryPartAddedNotification.json](app-server-schemas/json/v2/ReasoningSummaryPartAddedNotification.json)
- [ReasoningSummaryTextDeltaNotification.json](app-server-schemas/json/v2/ReasoningSummaryTextDeltaNotification.json)
- [ReasoningTextDeltaNotification.json](app-server-schemas/json/v2/ReasoningTextDeltaNotification.json)
- [ReviewStartParams.json](app-server-schemas/json/v2/ReviewStartParams.json)
- [ReviewStartResponse.json](app-server-schemas/json/v2/ReviewStartResponse.json)
- [SkillsConfigWriteParams.json](app-server-schemas/json/v2/SkillsConfigWriteParams.json)
- [SkillsConfigWriteResponse.json](app-server-schemas/json/v2/SkillsConfigWriteResponse.json)
- [SkillsListParams.json](app-server-schemas/json/v2/SkillsListParams.json)
- [SkillsListResponse.json](app-server-schemas/json/v2/SkillsListResponse.json)
- [SkillsRemoteReadParams.json](app-server-schemas/json/v2/SkillsRemoteReadParams.json)
- [SkillsRemoteReadResponse.json](app-server-schemas/json/v2/SkillsRemoteReadResponse.json)
- [SkillsRemoteWriteParams.json](app-server-schemas/json/v2/SkillsRemoteWriteParams.json)
- [SkillsRemoteWriteResponse.json](app-server-schemas/json/v2/SkillsRemoteWriteResponse.json)
- [TerminalInteractionNotification.json](app-server-schemas/json/v2/TerminalInteractionNotification.json)
- [ThreadArchiveParams.json](app-server-schemas/json/v2/ThreadArchiveParams.json)
- [ThreadArchiveResponse.json](app-server-schemas/json/v2/ThreadArchiveResponse.json)
- [ThreadBackgroundTerminalsCleanParams.json](app-server-schemas/json/v2/ThreadBackgroundTerminalsCleanParams.json)
- [ThreadBackgroundTerminalsCleanResponse.json](app-server-schemas/json/v2/ThreadBackgroundTerminalsCleanResponse.json)
- [ThreadCompactStartParams.json](app-server-schemas/json/v2/ThreadCompactStartParams.json)
- [ThreadCompactStartResponse.json](app-server-schemas/json/v2/ThreadCompactStartResponse.json)
- [ThreadForkParams.json](app-server-schemas/json/v2/ThreadForkParams.json)
- [ThreadForkResponse.json](app-server-schemas/json/v2/ThreadForkResponse.json)
- [ThreadListParams.json](app-server-schemas/json/v2/ThreadListParams.json)
- [ThreadListResponse.json](app-server-schemas/json/v2/ThreadListResponse.json)
- [ThreadLoadedListParams.json](app-server-schemas/json/v2/ThreadLoadedListParams.json)
- [ThreadLoadedListResponse.json](app-server-schemas/json/v2/ThreadLoadedListResponse.json)
- [ThreadNameUpdatedNotification.json](app-server-schemas/json/v2/ThreadNameUpdatedNotification.json)
- [ThreadReadParams.json](app-server-schemas/json/v2/ThreadReadParams.json)
- [ThreadReadResponse.json](app-server-schemas/json/v2/ThreadReadResponse.json)
- [ThreadResumeParams.json](app-server-schemas/json/v2/ThreadResumeParams.json)
- [ThreadResumeResponse.json](app-server-schemas/json/v2/ThreadResumeResponse.json)
- [ThreadRollbackParams.json](app-server-schemas/json/v2/ThreadRollbackParams.json)
- [ThreadRollbackResponse.json](app-server-schemas/json/v2/ThreadRollbackResponse.json)
- [ThreadSetNameParams.json](app-server-schemas/json/v2/ThreadSetNameParams.json)
- [ThreadSetNameResponse.json](app-server-schemas/json/v2/ThreadSetNameResponse.json)
- [ThreadStartParams.json](app-server-schemas/json/v2/ThreadStartParams.json)
- [ThreadStartResponse.json](app-server-schemas/json/v2/ThreadStartResponse.json)
- [ThreadStartedNotification.json](app-server-schemas/json/v2/ThreadStartedNotification.json)
- [ThreadTokenUsageUpdatedNotification.json](app-server-schemas/json/v2/ThreadTokenUsageUpdatedNotification.json)
- [ThreadUnarchiveParams.json](app-server-schemas/json/v2/ThreadUnarchiveParams.json)
- [ThreadUnarchiveResponse.json](app-server-schemas/json/v2/ThreadUnarchiveResponse.json)
- [TurnCompletedNotification.json](app-server-schemas/json/v2/TurnCompletedNotification.json)
- [TurnDiffUpdatedNotification.json](app-server-schemas/json/v2/TurnDiffUpdatedNotification.json)
- [TurnInterruptParams.json](app-server-schemas/json/v2/TurnInterruptParams.json)
- [TurnInterruptResponse.json](app-server-schemas/json/v2/TurnInterruptResponse.json)
- [TurnPlanUpdatedNotification.json](app-server-schemas/json/v2/TurnPlanUpdatedNotification.json)
- [TurnStartParams.json](app-server-schemas/json/v2/TurnStartParams.json)
- [TurnStartResponse.json](app-server-schemas/json/v2/TurnStartResponse.json)
- [TurnStartedNotification.json](app-server-schemas/json/v2/TurnStartedNotification.json)
- [TurnSteerParams.json](app-server-schemas/json/v2/TurnSteerParams.json)
- [TurnSteerResponse.json](app-server-schemas/json/v2/TurnSteerResponse.json)
- [WindowsWorldWritableWarningNotification.json](app-server-schemas/json/v2/WindowsWorldWritableWarningNotification.json)

### TypeScript Root

- [AbsolutePathBuf.ts](app-server-schemas/typescript/AbsolutePathBuf.ts)
- [AddConversationListenerParams.ts](app-server-schemas/typescript/AddConversationListenerParams.ts)
- [AddConversationSubscriptionResponse.ts](app-server-schemas/typescript/AddConversationSubscriptionResponse.ts)
- [AgentMessageContent.ts](app-server-schemas/typescript/AgentMessageContent.ts)
- [AgentMessageContentDeltaEvent.ts](app-server-schemas/typescript/AgentMessageContentDeltaEvent.ts)
- [AgentMessageDeltaEvent.ts](app-server-schemas/typescript/AgentMessageDeltaEvent.ts)
- [AgentMessageEvent.ts](app-server-schemas/typescript/AgentMessageEvent.ts)
- [AgentMessageItem.ts](app-server-schemas/typescript/AgentMessageItem.ts)
- [AgentReasoningDeltaEvent.ts](app-server-schemas/typescript/AgentReasoningDeltaEvent.ts)
- [AgentReasoningEvent.ts](app-server-schemas/typescript/AgentReasoningEvent.ts)
- [AgentReasoningRawContentDeltaEvent.ts](app-server-schemas/typescript/AgentReasoningRawContentDeltaEvent.ts)
- [AgentReasoningRawContentEvent.ts](app-server-schemas/typescript/AgentReasoningRawContentEvent.ts)
- [AgentReasoningSectionBreakEvent.ts](app-server-schemas/typescript/AgentReasoningSectionBreakEvent.ts)
- [AgentStatus.ts](app-server-schemas/typescript/AgentStatus.ts)
- [ApplyPatchApprovalParams.ts](app-server-schemas/typescript/ApplyPatchApprovalParams.ts)
- [ApplyPatchApprovalRequestEvent.ts](app-server-schemas/typescript/ApplyPatchApprovalRequestEvent.ts)
- [ApplyPatchApprovalResponse.ts](app-server-schemas/typescript/ApplyPatchApprovalResponse.ts)
- [ArchiveConversationParams.ts](app-server-schemas/typescript/ArchiveConversationParams.ts)
- [ArchiveConversationResponse.ts](app-server-schemas/typescript/ArchiveConversationResponse.ts)
- [AskForApproval.ts](app-server-schemas/typescript/AskForApproval.ts)
- [AuthMode.ts](app-server-schemas/typescript/AuthMode.ts)
- [AuthStatusChangeNotification.ts](app-server-schemas/typescript/AuthStatusChangeNotification.ts)
- [BackgroundEventEvent.ts](app-server-schemas/typescript/BackgroundEventEvent.ts)
- [ByteRange.ts](app-server-schemas/typescript/ByteRange.ts)
- [CallToolResult.ts](app-server-schemas/typescript/CallToolResult.ts)
- [CancelLoginChatGptParams.ts](app-server-schemas/typescript/CancelLoginChatGptParams.ts)
- [CancelLoginChatGptResponse.ts](app-server-schemas/typescript/CancelLoginChatGptResponse.ts)
- [ClientInfo.ts](app-server-schemas/typescript/ClientInfo.ts)
- [ClientNotification.ts](app-server-schemas/typescript/ClientNotification.ts)
- [ClientRequest.ts](app-server-schemas/typescript/ClientRequest.ts)
- [CodexErrorInfo.ts](app-server-schemas/typescript/CodexErrorInfo.ts)
- [CollabAgentInteractionBeginEvent.ts](app-server-schemas/typescript/CollabAgentInteractionBeginEvent.ts)
- [CollabAgentInteractionEndEvent.ts](app-server-schemas/typescript/CollabAgentInteractionEndEvent.ts)
- [CollabAgentSpawnBeginEvent.ts](app-server-schemas/typescript/CollabAgentSpawnBeginEvent.ts)
- [CollabAgentSpawnEndEvent.ts](app-server-schemas/typescript/CollabAgentSpawnEndEvent.ts)
- [CollabCloseBeginEvent.ts](app-server-schemas/typescript/CollabCloseBeginEvent.ts)
- [CollabCloseEndEvent.ts](app-server-schemas/typescript/CollabCloseEndEvent.ts)
- [CollabResumeBeginEvent.ts](app-server-schemas/typescript/CollabResumeBeginEvent.ts)
- [CollabResumeEndEvent.ts](app-server-schemas/typescript/CollabResumeEndEvent.ts)
- [CollabWaitingBeginEvent.ts](app-server-schemas/typescript/CollabWaitingBeginEvent.ts)
- [CollabWaitingEndEvent.ts](app-server-schemas/typescript/CollabWaitingEndEvent.ts)
- [CollaborationMode.ts](app-server-schemas/typescript/CollaborationMode.ts)
- [CollaborationModeMask.ts](app-server-schemas/typescript/CollaborationModeMask.ts)
- [ContentItem.ts](app-server-schemas/typescript/ContentItem.ts)
- [ContextCompactedEvent.ts](app-server-schemas/typescript/ContextCompactedEvent.ts)
- [ContextCompactionItem.ts](app-server-schemas/typescript/ContextCompactionItem.ts)
- [ConversationGitInfo.ts](app-server-schemas/typescript/ConversationGitInfo.ts)
- [ConversationSummary.ts](app-server-schemas/typescript/ConversationSummary.ts)
- [CreditsSnapshot.ts](app-server-schemas/typescript/CreditsSnapshot.ts)
- [CustomPrompt.ts](app-server-schemas/typescript/CustomPrompt.ts)
- [DeprecationNoticeEvent.ts](app-server-schemas/typescript/DeprecationNoticeEvent.ts)
- [DynamicToolCallRequest.ts](app-server-schemas/typescript/DynamicToolCallRequest.ts)
- [ElicitationRequestEvent.ts](app-server-schemas/typescript/ElicitationRequestEvent.ts)
- [ErrorEvent.ts](app-server-schemas/typescript/ErrorEvent.ts)
- [EventMsg.ts](app-server-schemas/typescript/EventMsg.ts)
- [ExecApprovalRequestEvent.ts](app-server-schemas/typescript/ExecApprovalRequestEvent.ts)
- [ExecCommandApprovalParams.ts](app-server-schemas/typescript/ExecCommandApprovalParams.ts)
- [ExecCommandApprovalResponse.ts](app-server-schemas/typescript/ExecCommandApprovalResponse.ts)
- [ExecCommandBeginEvent.ts](app-server-schemas/typescript/ExecCommandBeginEvent.ts)
- [ExecCommandEndEvent.ts](app-server-schemas/typescript/ExecCommandEndEvent.ts)
- [ExecCommandOutputDeltaEvent.ts](app-server-schemas/typescript/ExecCommandOutputDeltaEvent.ts)
- [ExecCommandSource.ts](app-server-schemas/typescript/ExecCommandSource.ts)
- [ExecCommandStatus.ts](app-server-schemas/typescript/ExecCommandStatus.ts)
- [ExecOneOffCommandParams.ts](app-server-schemas/typescript/ExecOneOffCommandParams.ts)
- [ExecOneOffCommandResponse.ts](app-server-schemas/typescript/ExecOneOffCommandResponse.ts)
- [ExecOutputStream.ts](app-server-schemas/typescript/ExecOutputStream.ts)
- [ExecPolicyAmendment.ts](app-server-schemas/typescript/ExecPolicyAmendment.ts)
- [ExitedReviewModeEvent.ts](app-server-schemas/typescript/ExitedReviewModeEvent.ts)
- [FileChange.ts](app-server-schemas/typescript/FileChange.ts)
- [ForcedLoginMethod.ts](app-server-schemas/typescript/ForcedLoginMethod.ts)
- [ForkConversationParams.ts](app-server-schemas/typescript/ForkConversationParams.ts)
- [ForkConversationResponse.ts](app-server-schemas/typescript/ForkConversationResponse.ts)
- [FunctionCallOutputBody.ts](app-server-schemas/typescript/FunctionCallOutputBody.ts)
- [FunctionCallOutputContentItem.ts](app-server-schemas/typescript/FunctionCallOutputContentItem.ts)
- [FunctionCallOutputPayload.ts](app-server-schemas/typescript/FunctionCallOutputPayload.ts)
- [FuzzyFileSearchParams.ts](app-server-schemas/typescript/FuzzyFileSearchParams.ts)
- [FuzzyFileSearchResponse.ts](app-server-schemas/typescript/FuzzyFileSearchResponse.ts)
- [FuzzyFileSearchResult.ts](app-server-schemas/typescript/FuzzyFileSearchResult.ts)
- [FuzzyFileSearchSessionCompletedNotification.ts](app-server-schemas/typescript/FuzzyFileSearchSessionCompletedNotification.ts)
- [FuzzyFileSearchSessionStartParams.ts](app-server-schemas/typescript/FuzzyFileSearchSessionStartParams.ts)
- [FuzzyFileSearchSessionStartResponse.ts](app-server-schemas/typescript/FuzzyFileSearchSessionStartResponse.ts)
- [FuzzyFileSearchSessionStopParams.ts](app-server-schemas/typescript/FuzzyFileSearchSessionStopParams.ts)
- [FuzzyFileSearchSessionStopResponse.ts](app-server-schemas/typescript/FuzzyFileSearchSessionStopResponse.ts)
- [FuzzyFileSearchSessionUpdateParams.ts](app-server-schemas/typescript/FuzzyFileSearchSessionUpdateParams.ts)
- [FuzzyFileSearchSessionUpdateResponse.ts](app-server-schemas/typescript/FuzzyFileSearchSessionUpdateResponse.ts)
- [FuzzyFileSearchSessionUpdatedNotification.ts](app-server-schemas/typescript/FuzzyFileSearchSessionUpdatedNotification.ts)
- [GetAuthStatusParams.ts](app-server-schemas/typescript/GetAuthStatusParams.ts)
- [GetAuthStatusResponse.ts](app-server-schemas/typescript/GetAuthStatusResponse.ts)
- [GetConversationSummaryParams.ts](app-server-schemas/typescript/GetConversationSummaryParams.ts)
- [GetConversationSummaryResponse.ts](app-server-schemas/typescript/GetConversationSummaryResponse.ts)
- [GetHistoryEntryResponseEvent.ts](app-server-schemas/typescript/GetHistoryEntryResponseEvent.ts)
- [GetUserAgentResponse.ts](app-server-schemas/typescript/GetUserAgentResponse.ts)
- [GetUserSavedConfigResponse.ts](app-server-schemas/typescript/GetUserSavedConfigResponse.ts)
- [GhostCommit.ts](app-server-schemas/typescript/GhostCommit.ts)
- [GitDiffToRemoteParams.ts](app-server-schemas/typescript/GitDiffToRemoteParams.ts)
- [GitDiffToRemoteResponse.ts](app-server-schemas/typescript/GitDiffToRemoteResponse.ts)
- [GitSha.ts](app-server-schemas/typescript/GitSha.ts)
- [HistoryEntry.ts](app-server-schemas/typescript/HistoryEntry.ts)
- [InitializeCapabilities.ts](app-server-schemas/typescript/InitializeCapabilities.ts)
- [InitializeParams.ts](app-server-schemas/typescript/InitializeParams.ts)
- [InitializeResponse.ts](app-server-schemas/typescript/InitializeResponse.ts)
- [InputItem.ts](app-server-schemas/typescript/InputItem.ts)
- [InputModality.ts](app-server-schemas/typescript/InputModality.ts)
- [InterruptConversationParams.ts](app-server-schemas/typescript/InterruptConversationParams.ts)
- [InterruptConversationResponse.ts](app-server-schemas/typescript/InterruptConversationResponse.ts)
- [ItemCompletedEvent.ts](app-server-schemas/typescript/ItemCompletedEvent.ts)
- [ItemStartedEvent.ts](app-server-schemas/typescript/ItemStartedEvent.ts)
- [ListConversationsParams.ts](app-server-schemas/typescript/ListConversationsParams.ts)
- [ListConversationsResponse.ts](app-server-schemas/typescript/ListConversationsResponse.ts)
- [ListCustomPromptsResponseEvent.ts](app-server-schemas/typescript/ListCustomPromptsResponseEvent.ts)
- [ListRemoteSkillsResponseEvent.ts](app-server-schemas/typescript/ListRemoteSkillsResponseEvent.ts)
- [ListSkillsResponseEvent.ts](app-server-schemas/typescript/ListSkillsResponseEvent.ts)
- [LocalShellAction.ts](app-server-schemas/typescript/LocalShellAction.ts)
- [LocalShellExecAction.ts](app-server-schemas/typescript/LocalShellExecAction.ts)
- [LocalShellStatus.ts](app-server-schemas/typescript/LocalShellStatus.ts)
- [LoginApiKeyParams.ts](app-server-schemas/typescript/LoginApiKeyParams.ts)
- [LoginApiKeyResponse.ts](app-server-schemas/typescript/LoginApiKeyResponse.ts)
- [LoginChatGptCompleteNotification.ts](app-server-schemas/typescript/LoginChatGptCompleteNotification.ts)
- [LoginChatGptResponse.ts](app-server-schemas/typescript/LoginChatGptResponse.ts)
- [LogoutChatGptResponse.ts](app-server-schemas/typescript/LogoutChatGptResponse.ts)
- [McpAuthStatus.ts](app-server-schemas/typescript/McpAuthStatus.ts)
- [McpInvocation.ts](app-server-schemas/typescript/McpInvocation.ts)
- [McpListToolsResponseEvent.ts](app-server-schemas/typescript/McpListToolsResponseEvent.ts)
- [McpStartupCompleteEvent.ts](app-server-schemas/typescript/McpStartupCompleteEvent.ts)
- [McpStartupFailure.ts](app-server-schemas/typescript/McpStartupFailure.ts)
- [McpStartupStatus.ts](app-server-schemas/typescript/McpStartupStatus.ts)
- [McpStartupUpdateEvent.ts](app-server-schemas/typescript/McpStartupUpdateEvent.ts)
- [McpToolCallBeginEvent.ts](app-server-schemas/typescript/McpToolCallBeginEvent.ts)
- [McpToolCallEndEvent.ts](app-server-schemas/typescript/McpToolCallEndEvent.ts)
- [MessagePhase.ts](app-server-schemas/typescript/MessagePhase.ts)
- [ModeKind.ts](app-server-schemas/typescript/ModeKind.ts)
- [NetworkAccess.ts](app-server-schemas/typescript/NetworkAccess.ts)
- [NetworkApprovalContext.ts](app-server-schemas/typescript/NetworkApprovalContext.ts)
- [NetworkApprovalProtocol.ts](app-server-schemas/typescript/NetworkApprovalProtocol.ts)
- [NewConversationParams.ts](app-server-schemas/typescript/NewConversationParams.ts)
- [NewConversationResponse.ts](app-server-schemas/typescript/NewConversationResponse.ts)
- [ParsedCommand.ts](app-server-schemas/typescript/ParsedCommand.ts)
- [PatchApplyBeginEvent.ts](app-server-schemas/typescript/PatchApplyBeginEvent.ts)
- [PatchApplyEndEvent.ts](app-server-schemas/typescript/PatchApplyEndEvent.ts)
- [PatchApplyStatus.ts](app-server-schemas/typescript/PatchApplyStatus.ts)
- [Personality.ts](app-server-schemas/typescript/Personality.ts)
- [PlanDeltaEvent.ts](app-server-schemas/typescript/PlanDeltaEvent.ts)
- [PlanItem.ts](app-server-schemas/typescript/PlanItem.ts)
- [PlanItemArg.ts](app-server-schemas/typescript/PlanItemArg.ts)
- [PlanType.ts](app-server-schemas/typescript/PlanType.ts)
- [Profile.ts](app-server-schemas/typescript/Profile.ts)
- [RateLimitSnapshot.ts](app-server-schemas/typescript/RateLimitSnapshot.ts)
- [RateLimitWindow.ts](app-server-schemas/typescript/RateLimitWindow.ts)
- [RawResponseItemEvent.ts](app-server-schemas/typescript/RawResponseItemEvent.ts)
- [ReadOnlyAccess.ts](app-server-schemas/typescript/ReadOnlyAccess.ts)
- [ReasoningContentDeltaEvent.ts](app-server-schemas/typescript/ReasoningContentDeltaEvent.ts)
- [ReasoningEffort.ts](app-server-schemas/typescript/ReasoningEffort.ts)
- [ReasoningItem.ts](app-server-schemas/typescript/ReasoningItem.ts)
- [ReasoningItemContent.ts](app-server-schemas/typescript/ReasoningItemContent.ts)
- [ReasoningItemReasoningSummary.ts](app-server-schemas/typescript/ReasoningItemReasoningSummary.ts)
- [ReasoningRawContentDeltaEvent.ts](app-server-schemas/typescript/ReasoningRawContentDeltaEvent.ts)
- [ReasoningSummary.ts](app-server-schemas/typescript/ReasoningSummary.ts)
- [RemoteSkillDownloadedEvent.ts](app-server-schemas/typescript/RemoteSkillDownloadedEvent.ts)
- [RemoteSkillSummary.ts](app-server-schemas/typescript/RemoteSkillSummary.ts)
- [RemoveConversationListenerParams.ts](app-server-schemas/typescript/RemoveConversationListenerParams.ts)
- [RemoveConversationSubscriptionResponse.ts](app-server-schemas/typescript/RemoveConversationSubscriptionResponse.ts)
- [RequestId.ts](app-server-schemas/typescript/RequestId.ts)
- [RequestUserInputEvent.ts](app-server-schemas/typescript/RequestUserInputEvent.ts)
- [RequestUserInputQuestion.ts](app-server-schemas/typescript/RequestUserInputQuestion.ts)
- [RequestUserInputQuestionOption.ts](app-server-schemas/typescript/RequestUserInputQuestionOption.ts)
- [Resource.ts](app-server-schemas/typescript/Resource.ts)
- [ResourceTemplate.ts](app-server-schemas/typescript/ResourceTemplate.ts)
- [ResponseItem.ts](app-server-schemas/typescript/ResponseItem.ts)
- [ResumeConversationParams.ts](app-server-schemas/typescript/ResumeConversationParams.ts)
- [ResumeConversationResponse.ts](app-server-schemas/typescript/ResumeConversationResponse.ts)
- [ReviewCodeLocation.ts](app-server-schemas/typescript/ReviewCodeLocation.ts)
- [ReviewDecision.ts](app-server-schemas/typescript/ReviewDecision.ts)
- [ReviewFinding.ts](app-server-schemas/typescript/ReviewFinding.ts)
- [ReviewLineRange.ts](app-server-schemas/typescript/ReviewLineRange.ts)
- [ReviewOutputEvent.ts](app-server-schemas/typescript/ReviewOutputEvent.ts)
- [ReviewRequest.ts](app-server-schemas/typescript/ReviewRequest.ts)
- [ReviewTarget.ts](app-server-schemas/typescript/ReviewTarget.ts)
- [SandboxMode.ts](app-server-schemas/typescript/SandboxMode.ts)
- [SandboxPolicy.ts](app-server-schemas/typescript/SandboxPolicy.ts)
- [SandboxSettings.ts](app-server-schemas/typescript/SandboxSettings.ts)
- [SendUserMessageParams.ts](app-server-schemas/typescript/SendUserMessageParams.ts)
- [SendUserMessageResponse.ts](app-server-schemas/typescript/SendUserMessageResponse.ts)
- [SendUserTurnParams.ts](app-server-schemas/typescript/SendUserTurnParams.ts)
- [SendUserTurnResponse.ts](app-server-schemas/typescript/SendUserTurnResponse.ts)
- [ServerNotification.ts](app-server-schemas/typescript/ServerNotification.ts)
- [ServerRequest.ts](app-server-schemas/typescript/ServerRequest.ts)
- [SessionConfiguredEvent.ts](app-server-schemas/typescript/SessionConfiguredEvent.ts)
- [SessionConfiguredNotification.ts](app-server-schemas/typescript/SessionConfiguredNotification.ts)
- [SessionNetworkProxyRuntime.ts](app-server-schemas/typescript/SessionNetworkProxyRuntime.ts)
- [SessionSource.ts](app-server-schemas/typescript/SessionSource.ts)
- [SetDefaultModelParams.ts](app-server-schemas/typescript/SetDefaultModelParams.ts)
- [SetDefaultModelResponse.ts](app-server-schemas/typescript/SetDefaultModelResponse.ts)
- [Settings.ts](app-server-schemas/typescript/Settings.ts)
- [SkillDependencies.ts](app-server-schemas/typescript/SkillDependencies.ts)
- [SkillErrorInfo.ts](app-server-schemas/typescript/SkillErrorInfo.ts)
- [SkillInterface.ts](app-server-schemas/typescript/SkillInterface.ts)
- [SkillMetadata.ts](app-server-schemas/typescript/SkillMetadata.ts)
- [SkillScope.ts](app-server-schemas/typescript/SkillScope.ts)
- [SkillToolDependency.ts](app-server-schemas/typescript/SkillToolDependency.ts)
- [SkillsListEntry.ts](app-server-schemas/typescript/SkillsListEntry.ts)
- [StepStatus.ts](app-server-schemas/typescript/StepStatus.ts)
- [StreamErrorEvent.ts](app-server-schemas/typescript/StreamErrorEvent.ts)
- [SubAgentSource.ts](app-server-schemas/typescript/SubAgentSource.ts)
- [TerminalInteractionEvent.ts](app-server-schemas/typescript/TerminalInteractionEvent.ts)
- [TextElement.ts](app-server-schemas/typescript/TextElement.ts)
- [ThreadId.ts](app-server-schemas/typescript/ThreadId.ts)
- [ThreadNameUpdatedEvent.ts](app-server-schemas/typescript/ThreadNameUpdatedEvent.ts)
- [ThreadRolledBackEvent.ts](app-server-schemas/typescript/ThreadRolledBackEvent.ts)
- [TokenCountEvent.ts](app-server-schemas/typescript/TokenCountEvent.ts)
- [TokenUsage.ts](app-server-schemas/typescript/TokenUsage.ts)
- [TokenUsageInfo.ts](app-server-schemas/typescript/TokenUsageInfo.ts)
- [Tool.ts](app-server-schemas/typescript/Tool.ts)
- [Tools.ts](app-server-schemas/typescript/Tools.ts)
- [TurnAbortReason.ts](app-server-schemas/typescript/TurnAbortReason.ts)
- [TurnAbortedEvent.ts](app-server-schemas/typescript/TurnAbortedEvent.ts)
- [TurnCompleteEvent.ts](app-server-schemas/typescript/TurnCompleteEvent.ts)
- [TurnDiffEvent.ts](app-server-schemas/typescript/TurnDiffEvent.ts)
- [TurnItem.ts](app-server-schemas/typescript/TurnItem.ts)
- [TurnStartedEvent.ts](app-server-schemas/typescript/TurnStartedEvent.ts)
- [UndoCompletedEvent.ts](app-server-schemas/typescript/UndoCompletedEvent.ts)
- [UndoStartedEvent.ts](app-server-schemas/typescript/UndoStartedEvent.ts)
- [UpdatePlanArgs.ts](app-server-schemas/typescript/UpdatePlanArgs.ts)
- [UserInfoResponse.ts](app-server-schemas/typescript/UserInfoResponse.ts)
- [UserInput.ts](app-server-schemas/typescript/UserInput.ts)
- [UserMessageEvent.ts](app-server-schemas/typescript/UserMessageEvent.ts)
- [UserMessageItem.ts](app-server-schemas/typescript/UserMessageItem.ts)
- [UserSavedConfig.ts](app-server-schemas/typescript/UserSavedConfig.ts)
- [Verbosity.ts](app-server-schemas/typescript/Verbosity.ts)
- [ViewImageToolCallEvent.ts](app-server-schemas/typescript/ViewImageToolCallEvent.ts)
- [WarningEvent.ts](app-server-schemas/typescript/WarningEvent.ts)
- [WebSearchAction.ts](app-server-schemas/typescript/WebSearchAction.ts)
- [WebSearchBeginEvent.ts](app-server-schemas/typescript/WebSearchBeginEvent.ts)
- [WebSearchEndEvent.ts](app-server-schemas/typescript/WebSearchEndEvent.ts)
- [WebSearchItem.ts](app-server-schemas/typescript/WebSearchItem.ts)
- [WebSearchMode.ts](app-server-schemas/typescript/WebSearchMode.ts)
- [index.ts](app-server-schemas/typescript/index.ts)

### TypeScript v2

- [Account.ts](app-server-schemas/typescript/v2/Account.ts)
- [AccountLoginCompletedNotification.ts](app-server-schemas/typescript/v2/AccountLoginCompletedNotification.ts)
- [AccountRateLimitsUpdatedNotification.ts](app-server-schemas/typescript/v2/AccountRateLimitsUpdatedNotification.ts)
- [AccountUpdatedNotification.ts](app-server-schemas/typescript/v2/AccountUpdatedNotification.ts)
- [AgentMessageDeltaNotification.ts](app-server-schemas/typescript/v2/AgentMessageDeltaNotification.ts)
- [AnalyticsConfig.ts](app-server-schemas/typescript/v2/AnalyticsConfig.ts)
- [AppDisabledReason.ts](app-server-schemas/typescript/v2/AppDisabledReason.ts)
- [AppInfo.ts](app-server-schemas/typescript/v2/AppInfo.ts)
- [AppListUpdatedNotification.ts](app-server-schemas/typescript/v2/AppListUpdatedNotification.ts)
- [AppsConfig.ts](app-server-schemas/typescript/v2/AppsConfig.ts)
- [AppsListParams.ts](app-server-schemas/typescript/v2/AppsListParams.ts)
- [AppsListResponse.ts](app-server-schemas/typescript/v2/AppsListResponse.ts)
- [AskForApproval.ts](app-server-schemas/typescript/v2/AskForApproval.ts)
- [ByteRange.ts](app-server-schemas/typescript/v2/ByteRange.ts)
- [CancelLoginAccountParams.ts](app-server-schemas/typescript/v2/CancelLoginAccountParams.ts)
- [CancelLoginAccountResponse.ts](app-server-schemas/typescript/v2/CancelLoginAccountResponse.ts)
- [CancelLoginAccountStatus.ts](app-server-schemas/typescript/v2/CancelLoginAccountStatus.ts)
- [ChatgptAuthTokensRefreshParams.ts](app-server-schemas/typescript/v2/ChatgptAuthTokensRefreshParams.ts)
- [ChatgptAuthTokensRefreshReason.ts](app-server-schemas/typescript/v2/ChatgptAuthTokensRefreshReason.ts)
- [ChatgptAuthTokensRefreshResponse.ts](app-server-schemas/typescript/v2/ChatgptAuthTokensRefreshResponse.ts)
- [CodexErrorInfo.ts](app-server-schemas/typescript/v2/CodexErrorInfo.ts)
- [CollabAgentState.ts](app-server-schemas/typescript/v2/CollabAgentState.ts)
- [CollabAgentStatus.ts](app-server-schemas/typescript/v2/CollabAgentStatus.ts)
- [CollabAgentTool.ts](app-server-schemas/typescript/v2/CollabAgentTool.ts)
- [CollabAgentToolCallStatus.ts](app-server-schemas/typescript/v2/CollabAgentToolCallStatus.ts)
- [CollaborationModeListParams.ts](app-server-schemas/typescript/v2/CollaborationModeListParams.ts)
- [CollaborationModeListResponse.ts](app-server-schemas/typescript/v2/CollaborationModeListResponse.ts)
- [CommandAction.ts](app-server-schemas/typescript/v2/CommandAction.ts)
- [CommandExecParams.ts](app-server-schemas/typescript/v2/CommandExecParams.ts)
- [CommandExecResponse.ts](app-server-schemas/typescript/v2/CommandExecResponse.ts)
- [CommandExecutionApprovalDecision.ts](app-server-schemas/typescript/v2/CommandExecutionApprovalDecision.ts)
- [CommandExecutionOutputDeltaNotification.ts](app-server-schemas/typescript/v2/CommandExecutionOutputDeltaNotification.ts)
- [CommandExecutionRequestApprovalParams.ts](app-server-schemas/typescript/v2/CommandExecutionRequestApprovalParams.ts)
- [CommandExecutionRequestApprovalResponse.ts](app-server-schemas/typescript/v2/CommandExecutionRequestApprovalResponse.ts)
- [CommandExecutionStatus.ts](app-server-schemas/typescript/v2/CommandExecutionStatus.ts)
- [Config.ts](app-server-schemas/typescript/v2/Config.ts)
- [ConfigBatchWriteParams.ts](app-server-schemas/typescript/v2/ConfigBatchWriteParams.ts)
- [ConfigEdit.ts](app-server-schemas/typescript/v2/ConfigEdit.ts)
- [ConfigLayer.ts](app-server-schemas/typescript/v2/ConfigLayer.ts)
- [ConfigLayerMetadata.ts](app-server-schemas/typescript/v2/ConfigLayerMetadata.ts)
- [ConfigLayerSource.ts](app-server-schemas/typescript/v2/ConfigLayerSource.ts)
- [ConfigReadParams.ts](app-server-schemas/typescript/v2/ConfigReadParams.ts)
- [ConfigReadResponse.ts](app-server-schemas/typescript/v2/ConfigReadResponse.ts)
- [ConfigRequirements.ts](app-server-schemas/typescript/v2/ConfigRequirements.ts)
- [ConfigRequirementsReadResponse.ts](app-server-schemas/typescript/v2/ConfigRequirementsReadResponse.ts)
- [ConfigValueWriteParams.ts](app-server-schemas/typescript/v2/ConfigValueWriteParams.ts)
- [ConfigWarningNotification.ts](app-server-schemas/typescript/v2/ConfigWarningNotification.ts)
- [ConfigWriteResponse.ts](app-server-schemas/typescript/v2/ConfigWriteResponse.ts)
- [ContextCompactedNotification.ts](app-server-schemas/typescript/v2/ContextCompactedNotification.ts)
- [CreditsSnapshot.ts](app-server-schemas/typescript/v2/CreditsSnapshot.ts)
- [DeprecationNoticeNotification.ts](app-server-schemas/typescript/v2/DeprecationNoticeNotification.ts)
- [DynamicToolCallOutputContentItem.ts](app-server-schemas/typescript/v2/DynamicToolCallOutputContentItem.ts)
- [DynamicToolCallParams.ts](app-server-schemas/typescript/v2/DynamicToolCallParams.ts)
- [DynamicToolCallResponse.ts](app-server-schemas/typescript/v2/DynamicToolCallResponse.ts)
- [DynamicToolSpec.ts](app-server-schemas/typescript/v2/DynamicToolSpec.ts)
- [ErrorNotification.ts](app-server-schemas/typescript/v2/ErrorNotification.ts)
- [ExecPolicyAmendment.ts](app-server-schemas/typescript/v2/ExecPolicyAmendment.ts)
- [ExperimentalFeature.ts](app-server-schemas/typescript/v2/ExperimentalFeature.ts)
- [ExperimentalFeatureListParams.ts](app-server-schemas/typescript/v2/ExperimentalFeatureListParams.ts)
- [ExperimentalFeatureListResponse.ts](app-server-schemas/typescript/v2/ExperimentalFeatureListResponse.ts)
- [ExperimentalFeatureStage.ts](app-server-schemas/typescript/v2/ExperimentalFeatureStage.ts)
- [FeedbackUploadParams.ts](app-server-schemas/typescript/v2/FeedbackUploadParams.ts)
- [FeedbackUploadResponse.ts](app-server-schemas/typescript/v2/FeedbackUploadResponse.ts)
- [FileChangeApprovalDecision.ts](app-server-schemas/typescript/v2/FileChangeApprovalDecision.ts)
- [FileChangeOutputDeltaNotification.ts](app-server-schemas/typescript/v2/FileChangeOutputDeltaNotification.ts)
- [FileChangeRequestApprovalParams.ts](app-server-schemas/typescript/v2/FileChangeRequestApprovalParams.ts)
- [FileChangeRequestApprovalResponse.ts](app-server-schemas/typescript/v2/FileChangeRequestApprovalResponse.ts)
- [FileUpdateChange.ts](app-server-schemas/typescript/v2/FileUpdateChange.ts)
- [GetAccountParams.ts](app-server-schemas/typescript/v2/GetAccountParams.ts)
- [GetAccountRateLimitsResponse.ts](app-server-schemas/typescript/v2/GetAccountRateLimitsResponse.ts)
- [GetAccountResponse.ts](app-server-schemas/typescript/v2/GetAccountResponse.ts)
- [GitInfo.ts](app-server-schemas/typescript/v2/GitInfo.ts)
- [ItemCompletedNotification.ts](app-server-schemas/typescript/v2/ItemCompletedNotification.ts)
- [ItemStartedNotification.ts](app-server-schemas/typescript/v2/ItemStartedNotification.ts)
- [ListMcpServerStatusParams.ts](app-server-schemas/typescript/v2/ListMcpServerStatusParams.ts)
- [ListMcpServerStatusResponse.ts](app-server-schemas/typescript/v2/ListMcpServerStatusResponse.ts)
- [LoginAccountParams.ts](app-server-schemas/typescript/v2/LoginAccountParams.ts)
- [LoginAccountResponse.ts](app-server-schemas/typescript/v2/LoginAccountResponse.ts)
- [LogoutAccountResponse.ts](app-server-schemas/typescript/v2/LogoutAccountResponse.ts)
- [McpAuthStatus.ts](app-server-schemas/typescript/v2/McpAuthStatus.ts)
- [McpServerOauthLoginCompletedNotification.ts](app-server-schemas/typescript/v2/McpServerOauthLoginCompletedNotification.ts)
- [McpServerOauthLoginParams.ts](app-server-schemas/typescript/v2/McpServerOauthLoginParams.ts)
- [McpServerOauthLoginResponse.ts](app-server-schemas/typescript/v2/McpServerOauthLoginResponse.ts)
- [McpServerRefreshResponse.ts](app-server-schemas/typescript/v2/McpServerRefreshResponse.ts)
- [McpServerStatus.ts](app-server-schemas/typescript/v2/McpServerStatus.ts)
- [McpToolCallError.ts](app-server-schemas/typescript/v2/McpToolCallError.ts)
- [McpToolCallProgressNotification.ts](app-server-schemas/typescript/v2/McpToolCallProgressNotification.ts)
- [McpToolCallResult.ts](app-server-schemas/typescript/v2/McpToolCallResult.ts)
- [McpToolCallStatus.ts](app-server-schemas/typescript/v2/McpToolCallStatus.ts)
- [MergeStrategy.ts](app-server-schemas/typescript/v2/MergeStrategy.ts)
- [MockExperimentalMethodParams.ts](app-server-schemas/typescript/v2/MockExperimentalMethodParams.ts)
- [MockExperimentalMethodResponse.ts](app-server-schemas/typescript/v2/MockExperimentalMethodResponse.ts)
- [Model.ts](app-server-schemas/typescript/v2/Model.ts)
- [ModelListParams.ts](app-server-schemas/typescript/v2/ModelListParams.ts)
- [ModelListResponse.ts](app-server-schemas/typescript/v2/ModelListResponse.ts)
- [NetworkAccess.ts](app-server-schemas/typescript/v2/NetworkAccess.ts)
- [NetworkRequirements.ts](app-server-schemas/typescript/v2/NetworkRequirements.ts)
- [OverriddenMetadata.ts](app-server-schemas/typescript/v2/OverriddenMetadata.ts)
- [PatchApplyStatus.ts](app-server-schemas/typescript/v2/PatchApplyStatus.ts)
- [PatchChangeKind.ts](app-server-schemas/typescript/v2/PatchChangeKind.ts)
- [PlanDeltaNotification.ts](app-server-schemas/typescript/v2/PlanDeltaNotification.ts)
- [ProfileV2.ts](app-server-schemas/typescript/v2/ProfileV2.ts)
- [RateLimitSnapshot.ts](app-server-schemas/typescript/v2/RateLimitSnapshot.ts)
- [RateLimitWindow.ts](app-server-schemas/typescript/v2/RateLimitWindow.ts)
- [RawResponseItemCompletedNotification.ts](app-server-schemas/typescript/v2/RawResponseItemCompletedNotification.ts)
- [ReadOnlyAccess.ts](app-server-schemas/typescript/v2/ReadOnlyAccess.ts)
- [ReasoningEffortOption.ts](app-server-schemas/typescript/v2/ReasoningEffortOption.ts)
- [ReasoningSummaryPartAddedNotification.ts](app-server-schemas/typescript/v2/ReasoningSummaryPartAddedNotification.ts)
- [ReasoningSummaryTextDeltaNotification.ts](app-server-schemas/typescript/v2/ReasoningSummaryTextDeltaNotification.ts)
- [ReasoningTextDeltaNotification.ts](app-server-schemas/typescript/v2/ReasoningTextDeltaNotification.ts)
- [RemoteSkillSummary.ts](app-server-schemas/typescript/v2/RemoteSkillSummary.ts)
- [ResidencyRequirement.ts](app-server-schemas/typescript/v2/ResidencyRequirement.ts)
- [ReviewDelivery.ts](app-server-schemas/typescript/v2/ReviewDelivery.ts)
- [ReviewStartParams.ts](app-server-schemas/typescript/v2/ReviewStartParams.ts)
- [ReviewStartResponse.ts](app-server-schemas/typescript/v2/ReviewStartResponse.ts)
- [ReviewTarget.ts](app-server-schemas/typescript/v2/ReviewTarget.ts)
- [SandboxMode.ts](app-server-schemas/typescript/v2/SandboxMode.ts)
- [SandboxPolicy.ts](app-server-schemas/typescript/v2/SandboxPolicy.ts)
- [SandboxWorkspaceWrite.ts](app-server-schemas/typescript/v2/SandboxWorkspaceWrite.ts)
- [SessionSource.ts](app-server-schemas/typescript/v2/SessionSource.ts)
- [SkillDependencies.ts](app-server-schemas/typescript/v2/SkillDependencies.ts)
- [SkillErrorInfo.ts](app-server-schemas/typescript/v2/SkillErrorInfo.ts)
- [SkillInterface.ts](app-server-schemas/typescript/v2/SkillInterface.ts)
- [SkillMetadata.ts](app-server-schemas/typescript/v2/SkillMetadata.ts)
- [SkillScope.ts](app-server-schemas/typescript/v2/SkillScope.ts)
- [SkillToolDependency.ts](app-server-schemas/typescript/v2/SkillToolDependency.ts)
- [SkillsConfigWriteParams.ts](app-server-schemas/typescript/v2/SkillsConfigWriteParams.ts)
- [SkillsConfigWriteResponse.ts](app-server-schemas/typescript/v2/SkillsConfigWriteResponse.ts)
- [SkillsListEntry.ts](app-server-schemas/typescript/v2/SkillsListEntry.ts)
- [SkillsListExtraRootsForCwd.ts](app-server-schemas/typescript/v2/SkillsListExtraRootsForCwd.ts)
- [SkillsListParams.ts](app-server-schemas/typescript/v2/SkillsListParams.ts)
- [SkillsListResponse.ts](app-server-schemas/typescript/v2/SkillsListResponse.ts)
- [SkillsRemoteReadParams.ts](app-server-schemas/typescript/v2/SkillsRemoteReadParams.ts)
- [SkillsRemoteReadResponse.ts](app-server-schemas/typescript/v2/SkillsRemoteReadResponse.ts)
- [SkillsRemoteWriteParams.ts](app-server-schemas/typescript/v2/SkillsRemoteWriteParams.ts)
- [SkillsRemoteWriteResponse.ts](app-server-schemas/typescript/v2/SkillsRemoteWriteResponse.ts)
- [TerminalInteractionNotification.ts](app-server-schemas/typescript/v2/TerminalInteractionNotification.ts)
- [TextElement.ts](app-server-schemas/typescript/v2/TextElement.ts)
- [TextPosition.ts](app-server-schemas/typescript/v2/TextPosition.ts)
- [TextRange.ts](app-server-schemas/typescript/v2/TextRange.ts)
- [Thread.ts](app-server-schemas/typescript/v2/Thread.ts)
- [ThreadArchiveParams.ts](app-server-schemas/typescript/v2/ThreadArchiveParams.ts)
- [ThreadArchiveResponse.ts](app-server-schemas/typescript/v2/ThreadArchiveResponse.ts)
- [ThreadBackgroundTerminalsCleanParams.ts](app-server-schemas/typescript/v2/ThreadBackgroundTerminalsCleanParams.ts)
- [ThreadBackgroundTerminalsCleanResponse.ts](app-server-schemas/typescript/v2/ThreadBackgroundTerminalsCleanResponse.ts)
- [ThreadCompactStartParams.ts](app-server-schemas/typescript/v2/ThreadCompactStartParams.ts)
- [ThreadCompactStartResponse.ts](app-server-schemas/typescript/v2/ThreadCompactStartResponse.ts)
- [ThreadForkParams.ts](app-server-schemas/typescript/v2/ThreadForkParams.ts)
- [ThreadForkResponse.ts](app-server-schemas/typescript/v2/ThreadForkResponse.ts)
- [ThreadItem.ts](app-server-schemas/typescript/v2/ThreadItem.ts)
- [ThreadListParams.ts](app-server-schemas/typescript/v2/ThreadListParams.ts)
- [ThreadListResponse.ts](app-server-schemas/typescript/v2/ThreadListResponse.ts)
- [ThreadLoadedListParams.ts](app-server-schemas/typescript/v2/ThreadLoadedListParams.ts)
- [ThreadLoadedListResponse.ts](app-server-schemas/typescript/v2/ThreadLoadedListResponse.ts)
- [ThreadNameUpdatedNotification.ts](app-server-schemas/typescript/v2/ThreadNameUpdatedNotification.ts)
- [ThreadReadParams.ts](app-server-schemas/typescript/v2/ThreadReadParams.ts)
- [ThreadReadResponse.ts](app-server-schemas/typescript/v2/ThreadReadResponse.ts)
- [ThreadResumeParams.ts](app-server-schemas/typescript/v2/ThreadResumeParams.ts)
- [ThreadResumeResponse.ts](app-server-schemas/typescript/v2/ThreadResumeResponse.ts)
- [ThreadRollbackParams.ts](app-server-schemas/typescript/v2/ThreadRollbackParams.ts)
- [ThreadRollbackResponse.ts](app-server-schemas/typescript/v2/ThreadRollbackResponse.ts)
- [ThreadSetNameParams.ts](app-server-schemas/typescript/v2/ThreadSetNameParams.ts)
- [ThreadSetNameResponse.ts](app-server-schemas/typescript/v2/ThreadSetNameResponse.ts)
- [ThreadSortKey.ts](app-server-schemas/typescript/v2/ThreadSortKey.ts)
- [ThreadSourceKind.ts](app-server-schemas/typescript/v2/ThreadSourceKind.ts)
- [ThreadStartParams.ts](app-server-schemas/typescript/v2/ThreadStartParams.ts)
- [ThreadStartResponse.ts](app-server-schemas/typescript/v2/ThreadStartResponse.ts)
- [ThreadStartedNotification.ts](app-server-schemas/typescript/v2/ThreadStartedNotification.ts)
- [ThreadTokenUsage.ts](app-server-schemas/typescript/v2/ThreadTokenUsage.ts)
- [ThreadTokenUsageUpdatedNotification.ts](app-server-schemas/typescript/v2/ThreadTokenUsageUpdatedNotification.ts)
- [ThreadUnarchiveParams.ts](app-server-schemas/typescript/v2/ThreadUnarchiveParams.ts)
- [ThreadUnarchiveResponse.ts](app-server-schemas/typescript/v2/ThreadUnarchiveResponse.ts)
- [TokenUsageBreakdown.ts](app-server-schemas/typescript/v2/TokenUsageBreakdown.ts)
- [ToolRequestUserInputAnswer.ts](app-server-schemas/typescript/v2/ToolRequestUserInputAnswer.ts)
- [ToolRequestUserInputOption.ts](app-server-schemas/typescript/v2/ToolRequestUserInputOption.ts)
- [ToolRequestUserInputParams.ts](app-server-schemas/typescript/v2/ToolRequestUserInputParams.ts)
- [ToolRequestUserInputQuestion.ts](app-server-schemas/typescript/v2/ToolRequestUserInputQuestion.ts)
- [ToolRequestUserInputResponse.ts](app-server-schemas/typescript/v2/ToolRequestUserInputResponse.ts)
- [ToolsV2.ts](app-server-schemas/typescript/v2/ToolsV2.ts)
- [Turn.ts](app-server-schemas/typescript/v2/Turn.ts)
- [TurnCompletedNotification.ts](app-server-schemas/typescript/v2/TurnCompletedNotification.ts)
- [TurnDiffUpdatedNotification.ts](app-server-schemas/typescript/v2/TurnDiffUpdatedNotification.ts)
- [TurnError.ts](app-server-schemas/typescript/v2/TurnError.ts)
- [TurnInterruptParams.ts](app-server-schemas/typescript/v2/TurnInterruptParams.ts)
- [TurnInterruptResponse.ts](app-server-schemas/typescript/v2/TurnInterruptResponse.ts)
- [TurnPlanStep.ts](app-server-schemas/typescript/v2/TurnPlanStep.ts)
- [TurnPlanStepStatus.ts](app-server-schemas/typescript/v2/TurnPlanStepStatus.ts)
- [TurnPlanUpdatedNotification.ts](app-server-schemas/typescript/v2/TurnPlanUpdatedNotification.ts)
- [TurnStartParams.ts](app-server-schemas/typescript/v2/TurnStartParams.ts)
- [TurnStartResponse.ts](app-server-schemas/typescript/v2/TurnStartResponse.ts)
- [TurnStartedNotification.ts](app-server-schemas/typescript/v2/TurnStartedNotification.ts)
- [TurnStatus.ts](app-server-schemas/typescript/v2/TurnStatus.ts)
- [TurnSteerParams.ts](app-server-schemas/typescript/v2/TurnSteerParams.ts)
- [TurnSteerResponse.ts](app-server-schemas/typescript/v2/TurnSteerResponse.ts)
- [UserInput.ts](app-server-schemas/typescript/v2/UserInput.ts)
- [WebSearchAction.ts](app-server-schemas/typescript/v2/WebSearchAction.ts)
- [WindowsWorldWritableWarningNotification.ts](app-server-schemas/typescript/v2/WindowsWorldWritableWarningNotification.ts)
- [WriteStatus.ts](app-server-schemas/typescript/v2/WriteStatus.ts)
- [index.ts](app-server-schemas/typescript/v2/index.ts)

## Проверка полноты

- Client methods: 66
- Server requests: 7
- Server notifications: 34
- Materialized JSON root schemas: 37
- Materialized JSON v1 schemas: 44
- Materialized JSON v2 schemas: 102
- Materialized TS root schemas: 236
- Materialized TS v2 schemas: 199
