import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  fetchAppsMarketplace,
  fetchAppsRefreshHealth,
  fetchAppsRuntimeHealth,
  getAppConfig,
  installApp,
  listAppBackups,
  setAppConfig,
  setAppEnabled,
  uninstallApp,
  setAppSecret,
} from "@/lib/apps";
import type { ShadowApp } from "@/types/apps";

const QK = ["apps", "marketplace"] as const;

export function useAppsMarketplace() {
  return useQuery({
    queryKey: QK,
    queryFn: fetchAppsMarketplace,
  });
}

export function useAppsMutations() {
  const qc = useQueryClient();

  const invalidate = async () => {
    await qc.invalidateQueries({ queryKey: QK });
  };

  const install = useMutation({
    mutationFn: async ({
      appId,
      acknowledgePermissions,
    }: {
      appId: string;
      acknowledgePermissions: boolean;
    }) => installApp(appId, acknowledgePermissions),
    onSuccess: async () => {
      await invalidate();
    },
  });

  const uninstall = useMutation({
    mutationFn: async (appId: string) => uninstallApp(appId),
    onSuccess: async () => {
      await invalidate();
    },
  });

  const setEnabled = useMutation({
    mutationFn: async ({
      appId,
      enabled,
    }: {
      appId: string;
      enabled: boolean;
    }) => setAppEnabled(appId, enabled),
    onSuccess: async () => {
      await invalidate();
    },
  });

  const refreshHealth = useMutation({
    mutationFn: fetchAppsRefreshHealth,
    onSuccess: async () => {
      await invalidate();
      await qc.invalidateQueries({ queryKey: ["apps", "runtime-health"] });
    },
  });

  return { install, uninstall, setEnabled, invalidate, refreshHealth };
}

export function useAppConfigQuery(appId: string | null, panelOpen: boolean) {
  return useQuery({
    queryKey: ["apps", "config", appId],
    queryFn: () => getAppConfig(appId!),
    enabled: Boolean(appId) && panelOpen,
  });
}

export function useAppBackupsQuery(panelOpen: boolean, filecoinOnly: boolean) {
  return useQuery({
    queryKey: ["apps", "backups"],
    queryFn: listAppBackups,
    enabled: panelOpen && filecoinOnly,
  });
}

export function useAppsRuntimeHealthQuery(panelOpen: boolean) {
  return useQuery({
    queryKey: ["apps", "runtime-health"],
    queryFn: fetchAppsRuntimeHealth,
    enabled: panelOpen,
    staleTime: 15_000,
  });
}

export function useSetAppConfigMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      appId,
      config,
    }: {
      appId: string;
      config: unknown;
    }) => {
      await setAppConfig(appId, config);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["apps", "config"] });
      await qc.invalidateQueries({ queryKey: QK });
    },
  });
}

export function useSetAppSecretMutation() {
  return useMutation({
    mutationFn: async ({
      appId,
      key,
      value,
    }: {
      appId: string;
      key: string;
      value: string;
    }) => {
      await setAppSecret(appId, key, value);
    },
    // We don't necessarily need to invalidate queries as secrets aren't fetched to the UI
  });
}

export type { ShadowApp };
