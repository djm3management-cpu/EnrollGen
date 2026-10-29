// Migration-free default-off installations never enter conference guards.
// Recovery discovers existing rooms on restart and enables their drain path.
export const conferenceRuntime = { draining: false };
