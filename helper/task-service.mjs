import { mkdirSync, copyFileSync, chmodSync, writeFileSync, unlinkSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { configuration, configPath } from './connection.mjs';
import { privateDirectory, taskRoot, taskError } from './task-store.mjs';
import {taskAgent} from './task-agents.mjs';
const label='com.getdiffer.tasks';
const xml=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
export function receiverPlist({node,helper,config,publisher,path,log,agent='codex'}) {
  taskAgent(agent);
  return `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict>
<key>Label</key><string>${label}</string><key>ProgramArguments</key><array><string>${xml(node)}</string><string>${xml(helper)}</string><string>tasks-watch</string><string>--agent</string><string>${xml(agent)}</string></array>
<key>RunAtLoad</key><true/><key>KeepAlive</key><true/><key>ThrottleInterval</key><integer>15</integer>
<key>EnvironmentVariables</key><dict><key>DIFFER_CONFIG</key><string>${xml(config)}</string><key>DIFFER_PUBLISH_URL</key><string>${xml(publisher)}</string><key>PATH</key><string>${xml(path)}</string></dict>
<key>StandardOutPath</key><string>${xml(log)}</string><key>StandardErrorPath</key><string>${xml(log)}</string>
</dict></plist>\n`;
}
export function installReceiver(remove=false,agent='codex') {
  taskAgent(agent);
  if(process.platform!=='darwin')throw taskError('use_tasks_watch');
  const file=join(homedir(),'Library','LaunchAgents',`${label}.plist`),domain=`gui/${process.getuid()}`;
  if(remove){
    try{execFileSync('/bin/launchctl',['bootout',`${domain}/${label}`],{stdio:'ignore'});}catch{}
    try{unlinkSync(file);}catch(error){if(error.code!=='ENOENT')throw error;}
    return {state:'stopped',notice:'Task files are retained. No received task was cancelled in Control.'};
  }
  const config=configuration();if(config.mode!=='connected')throw taskError('account_connection_required');
  const root=join(taskRoot(),'receiver');privateDirectory(taskRoot());privateDirectory(root);
  const helper=join(root,'differ.cjs'),log=join(root,'receiver.log');
  // Keep the installed receiver outside the versioned plugin cache. Reinstall
  // after a plugin update to replace this copy deliberately.
  copyFileSync(resolve(process.argv[1]),helper);chmodSync(helper,0o600);
  writeFileSync(log,'',{flag:'a',mode:0o600});chmodSync(log,0o600);
  // LaunchAgents is a standard user directory and need not have private mode.
  mkdirSync(join(homedir(),'Library','LaunchAgents'),{recursive:true});
  writeFileSync(file,receiverPlist({node:process.execPath,helper,config:resolve(configPath()),publisher:config.url,path:process.env.PATH||'',log,agent}),{mode:0o600});
  try{execFileSync('/bin/launchctl',['bootout',`${domain}/${label}`],{stdio:'ignore'});}catch{}
  try{execFileSync('/bin/launchctl',['bootstrap',domain,file],{stdio:'ignore'});}
  catch{throw taskError('receiver_install_failed');}
  return {state:'started',notice:'The receiver will run tasks sent to this connection. Use tasks-uninstall to stop it.'};
}
