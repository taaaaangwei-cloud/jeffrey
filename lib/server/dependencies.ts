import { createOpenAIClient } from "../ai/client.ts";
import { createOpenAIProvider } from "../ai/openai-provider.ts";
import { createChatEngine } from "../chat/engine.ts";
import { createIncomingMessageEngine } from "../chat/incoming-message-engine.ts";
import { createOpenAIIncomingIntentModel } from "../chat/openai-incoming-intent-model.ts";
import { createSupabaseChatRepository } from "../chat/supabase-repository.ts";
import { getDevelopmentAgentConfig, getLocalComputerAgentConfig, getServerConfig, getWebPushConfig } from "../config/server.ts";
import { createGitHubActionsDevelopmentRunner } from "../development/github-actions-runner.ts";
import { createGitHubAppInstallationTokenProvider } from "../development/github-app-auth.ts";
import { createGitHubReleaseDispatcher } from "../development/release-dispatcher.ts";
import { createDevelopmentTaskService } from "../development/service.ts";
import { createSupabaseDevelopmentTaskRepository } from "../development/supabase-repository.ts";
import { createKnowledgeEngine } from "../knowledge/engine.ts";
import { createOpenAIKnowledgeMigrator } from "../knowledge/migrate-character.ts";
import { createSupabaseKnowledgeRepository } from "../knowledge/supabase-repository.ts";
import { createOpenAIEmbeddingProvider } from "../memory/embedding.ts";
import { createMemoryEngine } from "../memory/engine.ts";
import { createOpenAIMemoryExtractor } from "../memory/extract.ts";
import { createSupabaseMemoryRepository } from "../memory/supabase-repository.ts";
import { createServerSupabase } from "../supabase/server.ts";
import { createSupabaseLocalComputerRepository } from "../local-computer/supabase-repository.ts";
import { createLocalComputerTaskService } from "../local-computer/service.ts";
import { createLocalDevicePairingService } from "../local-computer/pairing-service.ts";
import { createSupabaseLocalPairingChallengeStore } from "../local-computer/supabase-pairing-store.ts";
import { createLocalAgentChannel } from "../local-computer/agent-channel.ts";
import { createSupabaseLocalConversationRepository } from "../local-conversation/supabase-repository.ts";
import { createLocalConversationService } from "../local-conversation/service.ts";
import { createPushService } from "../push/service.ts";

export function createServerDependencies() {
  const config = getServerConfig();
  const developmentConfig = getDevelopmentAgentConfig();
  const localComputerConfig = getLocalComputerAgentConfig();
  const webPushConfig = getWebPushConfig();
  const supabase = createServerSupabase(config);
  const chatRepository = createSupabaseChatRepository(supabase);
  const cloud = config.aiRuntime === "openai" ? (() => {
    const openai = createOpenAIClient(config);
    const embeddings = createOpenAIEmbeddingProvider({ client: openai, model: config.embeddingModel! });
    const memoryRepository = createSupabaseMemoryRepository(supabase);
    const memory = createMemoryEngine({ repository: memoryRepository, embeddings, extractor: createOpenAIMemoryExtractor({ client: openai, model: config.openAIModel! }) });
    const knowledge = createKnowledgeEngine({ repository: createSupabaseKnowledgeRepository(supabase), embeddings, migrateDocument: createOpenAIKnowledgeMigrator({ client: openai, model: config.openAIModel!, supabase, memoryRepository, embeddings, userId: config.privateUserId, characterId: config.defaultCharacterId }) });
    const chat = createChatEngine({ repository: chatRepository, ai: createOpenAIProvider({ client: openai, model: config.openAIModel! }), memories: memory, knowledge });
    return { openai, memory, knowledge, chat };
  })() : null;

  const developmentRepository = createSupabaseDevelopmentTaskRepository(supabase);
  const installationToken = developmentConfig.configured
    ? createGitHubAppInstallationTokenProvider({
        appId: developmentConfig.githubAppId!,
        installationId: developmentConfig.githubInstallationId!,
        privateKey: developmentConfig.githubPrivateKey!,
      })
    : null;
  const cloudDevelopmentConfigured = config.aiRuntime === "openai" && developmentConfig.configured;
  const developmentRunner = cloudDevelopmentConfigured
    ? createGitHubActionsDevelopmentRunner({
        repository: developmentConfig.repository!,
        installationToken: installationToken!,
      })
    : {
        async start() { throw new Error("DEVELOPMENT_RUNNER_NOT_CONNECTED"); },
        async continue() { throw new Error("DEVELOPMENT_RUNNER_NOT_CONNECTED"); },
      };
  const developmentTasks = createDevelopmentTaskService({
    repository: developmentRepository,
    runner: developmentRunner,
    release: cloudDevelopmentConfigured ? createGitHubReleaseDispatcher({
      repository: developmentConfig.repository!,
      installationToken: installationToken!,
    }) : undefined,
  });
  const localComputerRepository = createSupabaseLocalComputerRepository(supabase);
  const localComputerTasks = localComputerConfig.enabled && localComputerConfig.configured
    ? createLocalComputerTaskService({ repository: localComputerRepository, approvalSecret: localComputerConfig.approvalSecret! })
    : undefined;
  const localDevicePairing = localComputerConfig.enabled && localComputerConfig.configured
    ? createLocalDevicePairingService({ repository: localComputerRepository, pairingSecret: localComputerConfig.pairingSecret!, deviceTokenSecret: localComputerConfig.deviceTokenSecret!, challengeStore: createSupabaseLocalPairingChallengeStore(supabase) })
    : undefined;
  const localAgentChannel = localComputerConfig.enabled && localComputerConfig.configured
    ? createLocalAgentChannel({ repository: localComputerRepository, leaseSeconds: localComputerConfig.leaseSeconds })
    : undefined;
  const localConversationRepository = createSupabaseLocalConversationRepository(supabase);
  const localConversations = localComputerConfig.enabled && localComputerConfig.configured
    ? createLocalConversationService({ repository: localConversationRepository, chat: chatRepository, devices: localComputerRepository, leaseSeconds: localComputerConfig.leaseSeconds })
    : undefined;
  const incoming = cloud ? createIncomingMessageEngine({
    repository: chatRepository,
    chat: cloud.chat,
    intent: createOpenAIIncomingIntentModel({ client: cloud.openai, model: config.openAIModel! }),
    tasks: developmentTasks,
    localTasks: localComputerTasks,
    localComputerEnabled: localComputerConfig.enabled && localComputerConfig.configured,
  }) : undefined;

  const push = createPushService(supabase, webPushConfig);
  return { config, developmentConfig, localComputerConfig, webPushConfig, supabase, chatRepository, memory: cloud?.memory, knowledge: cloud?.knowledge, chat: cloud?.chat, incoming, developmentTasks, localComputerRepository, localComputerTasks, localDevicePairing, localAgentChannel, localConversationRepository, localConversations, push };
}
