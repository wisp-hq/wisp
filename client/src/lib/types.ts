export interface PBBaseRecord {
  id: string;
  collectionId: string;
  collectionName: string;
  created: string;
  updated: string;
}

export type UserRole = 'admin' | 'player';

export type GamepadLayout = 'nintendo' | 'xbox' | 'sony';

export type KeyboardLayout = 'auto' | 'qwerty' | 'azerty';

export interface HudPrefs {
  hideHandle: boolean;
  keepAlive: boolean;
  audioEnabled: boolean;
  audioOutputDeviceId: string;
  microphoneEnabled: boolean;
  microphoneDeviceId: string;
  gamepadEnabled: boolean;
  gamepadLayouts: Record<string, GamepadLayout>;
  keyboardLayout: KeyboardLayout;
  videoBitrate: number;
  videoBitrateAuto: boolean;
  framerate: number;
  manualResolution: { width: number; height: number } | null;
  clipboardIn: boolean;
  clipboardOut: boolean;
  h264Crf: number;
  jpegQuality: number;
  binaryClipboard: boolean;
  paintOverQuality: boolean;
  browserCursors: boolean;
  scalingDpi: number;
  cssScaling: boolean;
  useCpu: boolean;
  rateControlMode: 'crf' | 'cbr';
  h264StreamingMode: boolean;
}

export const DEFAULT_HUD_PREFS: HudPrefs = {
  hideHandle: false,
  keepAlive: false,
  audioEnabled: true,
  audioOutputDeviceId: '',
  microphoneEnabled: false,
  microphoneDeviceId: '',
  gamepadEnabled: true,
  gamepadLayouts: {},
  keyboardLayout: 'auto',
  videoBitrate: 8,
  videoBitrateAuto: true,
  framerate: 60,
  manualResolution: null,
  clipboardIn: true,
  clipboardOut: true,
  h264Crf: 25,
  jpegQuality: 40,
  binaryClipboard: false,
  paintOverQuality: true,
  browserCursors: false,
  scalingDpi: 96,
  cssScaling: false,
  useCpu: false,
  rateControlMode: 'crf',
  h264StreamingMode: false,
};

export type Region = 'eu' | 'us' | 'jp' | 'wor';

export const DEFAULT_REGION: Region = 'eu';

export interface UserRecord extends PBBaseRecord {
  email: string;
  emailVisibility: boolean;
  verified: boolean;
  name: string;
  avatar: string;
  theme: string;
  role: UserRole;
  region: Region | '';
  hudPrefs: Partial<HudPrefs> | null;
}

export type ImageStatus = 'pending' | 'not_pulled' | 'pulling' | 'up_to_date' | 'outdated' | 'error';

export interface GroupedMount {
  name: string;
  mode: 'ro' | 'rw';
  hostPath?: string;
  containerPath?: string;
}

interface VolumeBase {
  id: string;
  scope: 'shared' | 'perUser';
  hostPath: string;
  containerPath: string;
  label?: string;
}

export interface SimpleVolume extends VolumeBase {
  mode: 'ro' | 'rw';
  mounts?: undefined;
}

export interface GroupedVolume extends VolumeBase {
  mounts: GroupedMount[];
  mode?: undefined;
}

export type Volume = SimpleVolume | GroupedVolume;

export function isGroupedVolume(v: Volume): v is GroupedVolume {
  return Array.isArray(v.mounts) && v.mounts.length > 0;
}

export interface ContainerSpec {
  image: string;
  env?: Record<string, string>;
}

export interface FeatureShortcuts {
  provider: string;
  containerPath: string;
}

export interface AppSpec {
  schemaVersion: number;
  slug: string;
  version: string;
  name: string;
  description?: string;
  icon: string;
  defaultLocale?: string;
  category?: string;
  container: ContainerSpec;
  volumes?: Volume[];
  features?: Record<string, unknown>;
  i18n?: Record<string, Record<string, string>>;
}

export type AppOverrides = Partial<Pick<AppSpec, 'container' | 'volumes' | 'features'>>;

export interface AppState {
  imageDigest?: string;
  imageStatus?: ImageStatus;
}

export interface AppRecord extends PBBaseRecord {
  slug: string;
  catalogSource: string;
  version: string;
  spec: AppOverrides | AppSpec;
  state: AppState | null;
  dismissedVersion: string;
}

export interface ShortcutIconURL {
  region: string;
  url: string;
}

export interface AppShortcutRecord extends PBBaseRecord {
  user: string;
  app: string;
  externalId: string;
  name: string;
  group: string;
  iconUrls: ShortcutIconURL[];
  launchParams: Record<string, string>;
  hidden: boolean;
}

export interface CatalogSourceRecord extends PBBaseRecord {
  url: string;
  name: string;
  enabled: boolean;
}

export type SessionStatus = 'starting' | 'ready' | 'stopping' | 'stopped' | 'failed';

export interface SessionRecord extends PBBaseRecord {
  user: string;
  app: string;
  containerName: string;
  containerIp: string;
  port: number;
  status: SessionStatus;
  failureCode: string;
  failureReason: string;
}

export type ParticipantRole = 'player' | 'viewer';

export interface SessionParticipantRecord extends PBBaseRecord {
  token: string;
  session: string;
  user: string;
  displayName: string;
  role: ParticipantRole;
  slot: number | null;
  createdBy: string;
  lastSeenAt: string;
  revokedAt: string;
  expiresAt: string;
}
