// Previews of received audio and video, played from a file the app wrote itself. Other file types
// are only offered for saving.
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { VideoView, useVideoPlayer } from 'expo-video';
import { Button, Label } from './ui.tsx';

export function VideoPreview({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri);
  return <VideoView player={player} nativeControls contentFit="contain" style={{ width: '100%', aspectRatio: 16 / 9, backgroundColor: '#000' }} />;
}

export function AudioPreview({ uri }: { uri: string }) {
  const player = useAudioPlayer(uri), status = useAudioPlayerStatus(player);
  const secs = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  return (
    <>
      <Button title={status.playing ? 'Pause' : 'Play'} onPress={() => (status.playing ? player.pause() : player.play())} />
      <Label dim size={14}>{secs(status.currentTime)} / {secs(status.duration || 0)}</Label>
    </>
  );
}
