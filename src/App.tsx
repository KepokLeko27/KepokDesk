import { useEffect, useRef } from 'react';
import { ActiveSessionView } from './components/ActiveSessionView';
import { PairingLanding } from './components/PairingLanding';
import { TopNav } from './components/TopNav';
import { usePeerSession } from './hooks/usePeerSession';
import { isValidAuthCode, normalizeAuthCode } from './utils/pairing';

export default function App() {
  const session = usePeerSession();
  const pairingInputRef = useRef<HTMLInputElement | null>(null);
  const autoJoinedRef = useRef(false);

  const { setRole, setAuthCode, connectSession } = session;

  // Parse ?pair=CODE (from QR scan) or ?role=...&code=...&autostart=1 deep links
  useEffect(() => {
    if (autoJoinedRef.current) return;
    const params = new URLSearchParams(window.location.search);
    const pairParam = params.get('pair');
    const codeParam = params.get('code');
    const roleParam = params.get('role');
    const autostart = params.get('autostart') === '1';

    if (pairParam && isValidAuthCode(pairParam)) {
      const normalized = normalizeAuthCode(pairParam);
      autoJoinedRef.current = true;
      setRole('controller');
      setAuthCode(normalized);
      connectSession('controller', normalized);
      return;
    }

    if (codeParam && isValidAuthCode(codeParam)) {
      const normalized = normalizeAuthCode(codeParam);
      const targetRole = roleParam === 'controller' ? 'controller' : 'host';
      setRole(targetRole);
      setAuthCode(normalized);
      if (autostart) {
        autoJoinedRef.current = true;
        connectSession(targetRole, normalized);
      }
    }
  }, [connectSession, setAuthCode, setRole]);

  const handleFocusPairing = () => {
    pairingInputRef.current?.focus();
    pairingInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  if (session.phase === 'connected' || session.phase === 'handshaking') {
    return (
      <ActiveSessionView
        role={session.role}
        authCode={session.authCode}
        deviceName={session.deviceName}
        peerName={session.peerName}
        phase={session.phase}
        fingerprint={session.fingerprint}
        transportMode={session.transportMode}
        rttMs={session.rttMs}
        errorBanner={session.errorBanner}
        onDismissError={() => session.setErrorBanner(null)}
        screenMode={session.screenMode}
        remoteScreenMode={session.remoteScreenMode}
        remoteVideoStream={session.remoteVideoStream}
        localVideoStream={session.localVideoStream}
        remoteFallbackFrame={session.remoteFallbackFrame}
        remoteControlEnabled={session.remoteControlEnabled}
        onToggleRemoteControl={() => session.setRemoteControlEnabled((v) => !v)}
        remotePointer={session.remotePointer}
        subscribeRemotePointer={session.subscribeRemotePointer}
        subscribeRemoteKeys={session.subscribeRemoteKeys}
        messages={session.messages}
        execLogs={session.execLogs}
        allowRemoteExec={session.allowRemoteExec}
        setAllowRemoteExec={session.setAllowRemoteExec}
        autoApproveExec={session.autoApproveExec}
        setAutoApproveExec={session.setAutoApproveExec}
        hostFiles={session.hostFiles}
        hostMetrics={session.hostMetrics}
        agentToken={session.agentToken}
        hostAgentStatus={session.hostAgentStatus}
        remoteAgentStatus={session.remoteAgentStatus}
        onConnectAgent={session.connectDesktopAgent}
        onDisconnectAgent={session.disconnectDesktopAgent}
        voice={session.voice}
        remoteAudioStream={session.remoteAudioStream}
        onStartDisplayShare={session.startSystemScreenShare}
        onStartWorkspaceStream={session.startWorkspaceStream}
        onStopShare={session.stopScreenShare}
        onWorkspaceFrame={session.sendWorkspaceFallbackFrame}
        onRefreshHostFiles={session.refreshHostFiles}
        onSendPointer={session.sendPointerControl}
        onSendKey={session.sendKeyControl}
        onSendChat={session.sendChatMessage}
        onSendFile={session.sendFile}
        onRunCommand={session.requestRemoteProgram}
        onApproveExec={session.approveRemoteExec}
        onDenyExec={session.denyRemoteExec}
        onToggleMic={session.toggleVoiceMic}
        onToggleSpeakerMute={session.toggleSpeakerMute}
        onDisconnect={session.disconnectSession}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#F7F7F4] text-[#111214]">
      <TopNav onFocusPairing={handleFocusPairing} />
      <PairingLanding
        role={session.role}
        setRole={session.setRole}
        authCode={session.authCode}
        setAuthCode={session.setAuthCode}
        deviceName={session.deviceName}
        setDeviceName={session.setDeviceName}
        phase={session.phase}
        errorBanner={session.errorBanner}
        onStartSession={(r, c) => session.connectSession(r, c)}
        onCancelWaiting={session.disconnectSession}
        pairingInputRef={pairingInputRef}
      />
    </div>
  );
}
