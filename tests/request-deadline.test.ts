import {afterEach,expect,it,vi} from 'vitest';
import {requestDeadline,interruptedRequest} from '../src/lib/request-deadline';
afterEach(()=>vi.useRealTimers());
it('distinguishes a stalled stage from user cancellation',()=>{vi.useFakeTimers();const c=new AbortController();const clear=requestDeadline(c,100);vi.advanceTimersByTime(100);expect(interruptedRequest(c.signal,null).status).toBe('error');expect(interruptedRequest(c.signal,null).error).toContain('Saved work');clear();const stopped=new AbortController();stopped.abort();expect(interruptedRequest(stopped.signal,null).status).toBe('cancelled');});
it('clears completed deadlines',()=>{vi.useFakeTimers();const c=new AbortController();requestDeadline(c,100)();vi.advanceTimersByTime(200);expect(c.signal.aborted).toBe(false);});
