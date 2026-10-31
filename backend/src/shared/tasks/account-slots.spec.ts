import { AccountSlots } from './account-slots';

type Gate = { open: () => void; started: boolean };

function slotsWithJobs() {
  const slots = new AccountSlots(2);
  const gates = new Map<string, Gate>();
  const add = (id: string, accountId = 'a', queuedAt = new Date(gates.size)) => {
    const gate: Gate = { open: () => undefined, started: false };
    gates.set(id, gate);
    slots.enqueue({
      id,
      accountId,
      queuedAt,
      run: () =>
        new Promise<void>((resolve) => {
          gate.started = true;
          gate.open = resolve;
        }),
    });
  };
  const started = () => [...gates].filter(([, gate]) => gate.started).map(([id]) => id);
  const finish = async (id: string) => {
    gates.get(id)?.open();
    await new Promise((resolve) => setImmediate(resolve));
  };
  return { slots, add, started, finish };
}

describe('AccountSlots', () => {
  it('runs two of an account at once and keeps the rest in line, oldest first', async () => {
    const { slots, add, started, finish } = slotsWithJobs();
    add('one');
    add('two');
    add('three');
    add('four');

    expect(started()).toEqual(['one', 'two']);
    expect(slots.position('three')).toBe(1);
    expect(slots.position('four')).toBe(2);
    expect(slots.position('one')).toBeNull();

    await finish('one');
    expect(started()).toEqual(['one', 'two', 'three']);
    expect(slots.position('four')).toBe(1);
  });

  it('gives each account its own two', () => {
    const { add, started } = slotsWithJobs();
    add('a1', 'a');
    add('a2', 'a');
    add('a3', 'a');
    add('b1', 'b');
    expect(started()).toEqual(['a1', 'a2', 'b1']);
  });

  it('puts an older job ahead of a newer one that was queued first', async () => {
    const { add, started, finish } = slotsWithJobs();
    add('one', 'a', new Date(1));
    add('two', 'a', new Date(2));
    add('late', 'a', new Date(9));
    add('early', 'a', new Date(5));

    await finish('one');
    expect(started()).toContain('early');
    expect(started()).not.toContain('late');
  });

  it('forgets a withdrawn job and frees the slot of one that fails', async () => {
    const slots = new AccountSlots(1);
    const ran: string[] = [];
    slots.enqueue({ id: 'bad', accountId: 'a', queuedAt: new Date(0), run: async () => { ran.push('bad'); throw new Error('boom'); } });
    slots.enqueue({ id: 'gone', accountId: 'a', queuedAt: new Date(1), run: async () => { ran.push('gone'); } });
    slots.enqueue({ id: 'next', accountId: 'a', queuedAt: new Date(2), run: async () => { ran.push('next'); } });
    slots.withdraw('gone');
    await new Promise((resolve) => setImmediate(resolve));
    expect(ran).toEqual(['bad', 'next']);
  });

  it('ignores a job it already holds', () => {
    const { slots, add, started } = slotsWithJobs();
    add('one');
    add('two');
    add('three');
    slots.enqueue({ id: 'three', accountId: 'a', queuedAt: new Date(0), run: async () => undefined });
    expect(started()).toEqual(['one', 'two']);
    expect(slots.position('three')).toBe(1);
  });
});
