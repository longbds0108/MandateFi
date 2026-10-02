import html from "./trace.html?raw";
export function PolicyTrace() {
  return <div dangerouslySetInnerHTML={{__html: html}} />;
}
