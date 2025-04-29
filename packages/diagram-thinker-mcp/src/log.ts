/**
 * Not needed on scf
 */

// errsole.initialize({
//   storage: new ErrsoleSQLite(
//     join(isProdEnv() ? "/tmp" : tmpdir(), "billing-agent.sqlite")
//   ),
//   appName: "billing-agent",
//   path: "/logs",
// });

export default console;
