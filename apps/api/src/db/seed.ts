import type { LinkType, Priority, TaskStatus } from '@postdog/shared';
import { daysBefore } from '../lib/time';
import { insertLink } from '../repositories/links';
import { insertNote } from '../repositories/notes';
import { getSetting, initSetting, setSetting } from '../repositories/settings';
import { insertTask } from '../repositories/tasks';
import { allocateIdentifiers } from '../services/tasks';
import type { Db } from './client';

/** Every time is in days before the seed runs. Fractions are allowed. */
interface SeedSubtask {
  title: string;
  description?: string;
  status: TaskStatus;
  priority: Priority;
  created: number;
  /** Defaults to `created`. */
  statusChanged?: number;
  /** Defaults to `statusChanged`. */
  updated?: number;
  notes?: readonly { daysAgo: number; body: string }[];
}

interface SeedTask extends SeedSubtask {
  key: string;
  subtasks?: readonly SeedSubtask[];
}

const SEED_TASKS = [
  {
    key: 'ci',
    title: 'Migrate CI from Jenkins to GitHub Actions',
    description:
      'Port the build, test and deploy pipelines. Keep Jenkins running until the new pipelines have been green for a week.',
    status: 'in_progress',
    priority: 'high',
    created: 29,
    statusChanged: 12,
    notes: [
      {
        daysAgo: 12,
        body: 'Unit tests run on Actions now. The Docker build is next; its layer cache needs a registry.',
      },
    ],
    subtasks: [
      {
        title: 'Port the unit test job',
        status: 'done',
        priority: 'high',
        created: 28,
        statusChanged: 20,
      },
      {
        title: 'Port the Docker image build',
        status: 'in_progress',
        priority: 'high',
        created: 28,
        statusChanged: 12,
      },
      {
        title: 'Move deploy secrets to GitHub environments',
        status: 'todo',
        priority: 'medium',
        created: 28,
      },
    ],
  },
  {
    key: 'n-plus-one',
    title: 'Fix N+1 queries on the projects list',
    description: 'The projects list runs one owner query per row. Batch them.',
    status: 'done',
    priority: 'high',
    created: 27,
    statusChanged: 21,
    notes: [
      {
        daysAgo: 21,
        body: 'Added a dataloader for project owners. The list loads in 300 ms instead of 2.1 s.',
      },
    ],
  },
  {
    key: 'flags',
    title: 'Remove stale feature flags',
    description:
      'Delete flags that have been at 100% for more than a month, and the code behind the off branch.',
    status: 'todo',
    priority: 'low',
    created: 26,
  },
  {
    key: 'pg-driver',
    title: 'Upgrade the Postgres driver to v9',
    description:
      'v9 changes the pool defaults and drops callback APIs. Check the idle timeout on the worker pool before rollout.',
    status: 'in_progress',
    priority: 'medium',
    created: 25,
    statusChanged: 9,
  },
  {
    key: 'login-redirect',
    title: 'Login redirect loses the return URL',
    description: 'After signing in, `returnTo` is dropped when the session cookie is refreshed.',
    status: 'done',
    priority: 'medium',
    created: 24,
    statusChanged: 19,
  },
  {
    key: 'login-redirect-report',
    title: 'After login, users land on the dashboard instead of the page they asked for',
    description: 'Reported by support for two enterprise customers.',
    status: 'done',
    priority: 'low',
    created: 23,
    statusChanged: 19,
  },
  {
    key: 'webhooks',
    title: 'Refactor Stripe webhook handlers',
    description:
      'One 600-line handler covers every event type. Split it per event and make each handler idempotent.',
    status: 'in_progress',
    priority: 'high',
    created: 22,
    statusChanged: 8,
    notes: [
      { daysAgo: 8, body: 'Split the handlers per event type. Idempotency keys are next.' },
      {
        daysAgo: 5,
        body: 'Blocked on a Stripe test-mode account for staging. Asked finance for access.',
      },
    ],
  },
  {
    key: 'dark-emails',
    title: 'Support dark mode in transactional emails',
    description: 'Logos and buttons disappear in Apple Mail dark mode.',
    status: 'todo',
    priority: 'low',
    created: 20,
  },
  {
    key: 'rate-limit',
    title: 'Add rate limiting to the public API',
    description:
      'Limit requests per API key so one client cannot starve the others. Answer 429 with a Retry-After header.',
    status: 'todo',
    priority: 'high',
    created: 18,
    updated: 16,
  },
  {
    key: 'sso',
    title: 'Add SAML single sign-on',
    description: 'Enterprise customers want to sign in with Okta and Azure AD.',
    status: 'in_progress',
    priority: 'high',
    created: 16,
    statusChanged: 3,
    notes: [{ daysAgo: 3, body: 'Picked samlify after the spike. Metadata upload is in review.' }],
    subtasks: [
      {
        title: 'Spike: evaluate SAML libraries',
        status: 'done',
        priority: 'medium',
        created: 16,
        statusChanged: 10,
      },
      {
        title: 'Metadata upload in org settings',
        status: 'in_progress',
        priority: 'high',
        created: 15,
        statusChanged: 3,
      },
    ],
  },
  {
    key: 'perf',
    title: 'Improve performance',
    description: '',
    status: 'todo',
    priority: 'medium',
    created: 15,
  },
  {
    key: 'audit-log',
    title: 'Add an audit log for admin actions',
    description: 'Record who changed roles, billing details and SSO settings, and when.',
    status: 'todo',
    priority: 'medium',
    created: 14,
  },
  {
    key: 'sentry',
    title: 'Route Sentry alerts to the on-call channel',
    description: 'Only alerts tagged `severity:high` should page.',
    status: 'done',
    priority: 'medium',
    created: 13,
    statusChanged: 11,
  },
  {
    key: 'api-docs',
    title: 'Publish OpenAPI docs for the public API',
    description: 'Generate the spec from the route schemas and host it at /docs.',
    status: 'todo',
    priority: 'medium',
    created: 11,
  },
  {
    key: 'csv-export',
    title: 'Add CSV export to the reports page',
    description:
      'Export the current report with its filters applied. Large reports must not time out.',
    status: 'in_progress',
    priority: 'medium',
    created: 10,
    statusChanged: 2,
    updated: 0.25,
    notes: [
      { daysAgo: 2, body: 'Started with the backend endpoint.' },
      {
        daysAgo: 0.3,
        body: 'The endpoint streams rows now, so 100k-row reports no longer time out. The UI button is next.',
      },
    ],
    subtasks: [
      {
        title: 'Streaming CSV endpoint',
        status: 'done',
        priority: 'medium',
        created: 9,
        statusChanged: 0.4,
      },
      {
        title: 'Export button and download state',
        status: 'todo',
        priority: 'medium',
        created: 9,
      },
    ],
  },
  {
    key: 'node-22',
    title: 'Upgrade services to Node 22',
    description: 'Node 20 leaves maintenance soon. Upgrade the API and the workers.',
    status: 'todo',
    priority: 'medium',
    created: 9,
  },
  {
    key: 'onboarding',
    title: 'Fix the onboarding thing',
    description: 'Sales mentioned it again on Monday.',
    status: 'todo',
    priority: 'high',
    created: 7,
  },
  {
    key: 'flaky-checkout',
    title: 'Fix flaky checkout e2e test',
    description: '`checkout.spec.ts` fails about one run in five on CI.',
    status: 'done',
    priority: 'high',
    created: 6,
    statusChanged: 0.15,
    notes: [
      {
        daysAgo: 0.15,
        body: "Root cause: the test clicked Pay before the Stripe iframe loaded. It now waits for the iframe's ready event. 50 CI runs green.",
      },
    ],
  },
  {
    key: 'rate-limit-again',
    title: 'Rate-limit public API endpoints',
    description: 'A single integration hammered /v1/* again last night. We need per-key limits.',
    status: 'todo',
    priority: 'medium',
    created: 4,
  },
  {
    key: 'reindex',
    title: 'Reindex search after the schema change',
    description: "Search misses projects created after Tuesday's migration.",
    status: 'todo',
    priority: 'high',
    created: 2,
  },
] as const satisfies readonly SeedTask[];

type SeedKey = (typeof SEED_TASKS)[number]['key'];

/** Oldest first, so ids and identifiers follow creation order and parents precede subtasks. */
interface SeedRow {
  task: SeedSubtask;
  key?: string;
  parentKey?: string;
}

const SEED_LINKS: readonly { from: SeedKey; to: SeedKey; type: LinkType; daysAgo: number }[] = [
  { from: 'ci', to: 'node-22', type: 'blocks', daysAgo: 9 },
  { from: 'rate-limit', to: 'api-docs', type: 'blocks', daysAgo: 11 },
  { from: 'sso', to: 'audit-log', type: 'relates', daysAgo: 14 },
  { from: 'pg-driver', to: 'reindex', type: 'relates', daysAgo: 2 },
  { from: 'login-redirect-report', to: 'login-redirect', type: 'duplicates', daysAgo: 19 },
];

/**
 * Seeds the database once. The check and every write share one transaction that
 * writes seededAt last, so a crash leaves either no seed or the whole seed, and a
 * database that was seeded is never seeded again, even after its tasks are deleted.
 */
export function seedDatabase(db: Db, now: number): boolean {
  return db.transaction(
    (tx) => {
      if (getSetting(tx, 'seededAt') !== undefined) return false;

      const seedTasks: readonly SeedTask[] = SEED_TASKS;
      const rows = seedTasks
        .flatMap((task): SeedRow[] => [
          { task, key: task.key },
          ...(task.subtasks ?? []).map((subtask) => ({ task: subtask, parentKey: task.key })),
        ])
        .sort((a, b) => b.task.created - a.task.created);

      const identifiers = allocateIdentifiers(tx, rows.length);
      const ids = new Map<string, number>();
      const idOf = (key: string) => {
        const id = ids.get(key);
        if (id === undefined) throw new Error(`Seed task "${key}" is not inserted yet`);
        return id;
      };

      rows.forEach(({ task, key, parentKey }, i) => {
        const statusChanged = task.statusChanged ?? task.created;
        const inserted = insertTask(tx, {
          identifier: identifiers[i]!,
          title: task.title,
          description: task.description ?? '',
          status: task.status,
          priority: task.priority,
          parentId: parentKey === undefined ? null : idOf(parentKey),
          createdAt: daysBefore(now, task.created),
          statusChangedAt: daysBefore(now, statusChanged),
          updatedAt: daysBefore(now, task.updated ?? statusChanged),
        });
        if (key !== undefined) ids.set(key, inserted.id);
        for (const note of task.notes ?? []) {
          insertNote(tx, {
            taskId: inserted.id,
            body: note.body,
            createdAt: daysBefore(now, note.daysAgo),
          });
        }
      });

      for (const link of SEED_LINKS) {
        insertLink(tx, {
          fromTaskId: idOf(link.from),
          toTaskId: idOf(link.to),
          type: link.type,
          createdBy: 'user',
          createdAt: daysBefore(now, link.daysAgo),
        });
      }

      initSetting(tx, 'aiEnabled', true);
      initSetting(tx, 'decompositionMode', 'suggest');
      setSetting(tx, 'seededAt', now);
      return true;
    },
    { behavior: 'immediate' },
  );
}
