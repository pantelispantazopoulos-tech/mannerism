// A stack of "I'll handle the hardware back press myself" callbacks.
// Exists because not every logical "screen" in this app is a real
// Next.js route with its own browser-history entry — the landing page's
// create/join forms, for instance, are local component state layered on
// top of "/". CapacitorBackButton (the actual event listener) checks this
// stack first, letting the top-most registrant intercept and return true
// (handled — e.g. "step back to the landing view"), and only falls
// through to real router/browser history if nothing on the stack claims
// it. See useBackHandler.ts for the hook that pushes/pops onto this.
type BackHandler = () => boolean;

const stack: BackHandler[] = [];

export function pushBackHandler(handler: BackHandler) {
  stack.push(handler);
}

export function popBackHandler(handler: BackHandler) {
  const i = stack.lastIndexOf(handler);
  if (i !== -1) stack.splice(i, 1);
}

// Returns true if some registered handler claimed (and handled) the back
// press — the caller should stop there rather than falling back to
// router/app-level navigation.
export function dispatchBackPress(): boolean {
  const top = stack[stack.length - 1];
  return top ? top() : false;
}
