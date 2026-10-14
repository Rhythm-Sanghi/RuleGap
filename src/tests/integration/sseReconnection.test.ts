import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import { executionRunner } from '../../server/runner/executionRunner.js';

describe('Slice 3 Integration: SSE Monotonic Sequence & Reconnection Replay', () => {
  it('delivers replayed events with monotonically increasing sequence IDs on reconnect', async () => {
    const runId = crypto.randomUUID();
    const client1Events: string[] = [];

    // Mock Express Response for Client 1
    const mockRes1 = {
      writableEnded: false,
      write: (data: string) => {
        client1Events.push(data);
        return true;
      },
      end: () => {
        mockRes1.writableEnded = true;
      },
      on: () => {},
    } as any;

    // Direct subscription for Client 1
    executionRunner.addSubscriber(runId, mockRes1);

    // Initial message is connected
    expect(client1Events.length).toBe(1);
    expect(client1Events[0]).toContain('event: connected');

    // Emit 3 sequential events into the runner
    executionRunner.emitEvent(runId, 'test_started', { caseId: 'case-1', value: 250000 });
    executionRunner.emitEvent(runId, 'test_completed', { caseId: 'case-1', classification: 'CONSISTENT' });
    executionRunner.emitEvent(runId, 'test_started', { caseId: 'case-2', value: 250001 });

    // Client 1 should have received connected + 3 events = 4 events
    expect(client1Events.length).toBe(4);
    expect(client1Events[1]).toContain('id: 1');
    expect(client1Events[1]).toContain('event: test_started');
    expect(client1Events[2]).toContain('id: 2');
    expect(client1Events[2]).toContain('event: test_completed');
    expect(client1Events[3]).toContain('id: 3');
    expect(client1Events[3]).toContain('event: test_started');

    // Simulate Client 2 reconnecting with Last-Event-ID: 1 (missed events 2 and 3)
    const client2Events: string[] = [];
    const mockRes2 = {
      writableEnded: false,
      write: (data: string) => {
        client2Events.push(data);
        return true;
      },
      end: () => {
        mockRes2.writableEnded = true;
      },
      on: () => {},
    } as any;

    executionRunner.addSubscriber(runId, mockRes2, 1);

    // Client 2 should receive connected + replayed events with seq > 1 (i.e., seq 2 and seq 3)
    expect(client2Events.length).toBe(3);
    expect(client2Events[0]).toContain('event: connected');
    expect(client2Events[1]).toContain('id: 2');
    expect(client2Events[1]).toContain('event: test_completed');
    expect(client2Events[2]).toContain('id: 3');
    expect(client2Events[2]).toContain('event: test_started');
  });
});
