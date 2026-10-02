import html from "./create.html?raw";
export function CreateMandate() {
  return <div dangerouslySetInnerHTML={{__html: html}} />;
}
