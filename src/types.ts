import type {ActivityEvent} from './activity';
export type Provider = {id: string; name: string; executable: string; args: string[]; env: Record<string,string>; cwd: string};
export type SavedSession = {id: string; provider: string; cwd: string; providerId?: string | null; canResume?: boolean};
export type Session = SavedSession & {items: ActivityEvent[]; busy: boolean; live: boolean; resuming?: boolean; identity?: unknown};
