import html from "./vault.html?raw";
export function Vault() {
  return <div dangerouslySetInnerHTML={{__html: html}} />;
}
