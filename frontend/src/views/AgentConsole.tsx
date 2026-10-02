import html from "./agent.html?raw";
export function AgentConsole() {
  return <div dangerouslySetInnerHTML={{__html: html}} />;
}
