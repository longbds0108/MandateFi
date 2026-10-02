import html from "./detail.html?raw";
export function MandateDetail() {
  return <div dangerouslySetInnerHTML={{__html: html}} />;
}
