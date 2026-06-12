import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { StyleSheet, View } from 'react-native';

export interface WebViewMessageEvent {
  nativeEvent: { data: string };
}

interface Props {
  source: { html?: string; uri?: string };
  onMessage: (e: WebViewMessageEvent) => void;
  style?: object;
  originWhitelist?: string[];
  javaScriptEnabled?: boolean;
  domStorageEnabled?: boolean;
  scrollEnabled?: boolean;
  /** iframe `allow` attribute (e.g. camera for the Ready Player Me creator). */
  allow?: string;
}

interface Handle {
  injectJavaScript: (code: string) => void;
  postMessage: (data: string) => void;
}

const GlobeWebView = forwardRef<Handle, Props>(function GlobeWebView(
  { source, onMessage, style, allow },
  ref,
) {
  const viewRef = useRef<any>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  useImperativeHandle(ref, () => ({
    injectJavaScript(code: string) {
      try {
        // Only works for same-origin (srcdoc) frames; cross-origin throws and is ignored.
        // eslint-disable-next-line no-eval
        (iframeRef.current?.contentWindow as any)?.eval(code);
      } catch {}
    },
    postMessage(data: string) {
      // Allowed cross-origin — used for the Ready Player Me frame API.
      iframeRef.current?.contentWindow?.postMessage(data, '*');
    },
  }));

  useEffect(() => {
    const node = viewRef.current;
    if (!node) return;

    const iframe = document.createElement('iframe');
    if (source.uri) iframe.src = source.uri;
    else iframe.srcdoc = source.html ?? '';
    if (allow) iframe.setAttribute('allow', allow);
    Object.assign(iframe.style, {
      width: '100%',
      height: '100%',
      border: 'none',
      display: 'block',
    });
    iframeRef.current = iframe;
    node.appendChild(iframe);

    const onMsg = (e: MessageEvent) => {
      if (e.source === iframe.contentWindow) {
        const data = typeof e.data === 'string' ? e.data : JSON.stringify(e.data);
        onMessage({ nativeEvent: { data } });
      }
    };
    window.addEventListener('message', onMsg);

    return () => {
      window.removeEventListener('message', onMsg);
      iframe.remove();
      iframeRef.current = null;
    };
  }, [source.html, source.uri, allow, onMessage]);

  return <View ref={viewRef} style={[styles.fill, style]} />;
});

export default GlobeWebView;

const styles = StyleSheet.create({ fill: { flex: 1 } });
