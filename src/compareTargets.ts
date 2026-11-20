import type {Session} from './types';

export function comparisonUnavailable(session: Session): string | undefined {
  if (session.resuming) return 'Reconnecting';
  if (!session.live) return 'Continue conversation first';
  if (session.busy) return 'Responding';
  if (session.changingAgent || session.changingModel) return 'Changing settings';
}
