/** A client-side deadline also terminates an idle response body. */
export function requestDeadline(controller:AbortController,milliseconds=290000){
 const timer=setTimeout(()=>controller.abort(new DOMException("This stage exceeded its time limit. Saved work is preserved; retry only this stage.","TimeoutError")),milliseconds);
 return ()=>clearTimeout(timer);
}
export function interruptedRequest(signal:AbortSignal,error:unknown){
 const timedOut=signal.aborted&&signal.reason?.name==="TimeoutError";
 return {status:signal.aborted&&!timedOut?"cancelled" as const:"error" as const,error:timedOut?signal.reason.message:signal.aborted?undefined:error instanceof Error?error.message:"Connection interrupted. Saved work is preserved."};
}
