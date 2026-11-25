import { type ComponentType, type Ref, useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { WebView as RNWebView, type WebViewProps } from "react-native-webview";

import * as Location from "expo-location";
import type { NavigationDestination } from "@/lib/navigation";
import { radii, spacing } from "@/src/theme";
import { useColors, useColorSchemeResolved } from "@/src/providers/ThemeProvider";
import { Text } from "./Text";

type WebHandle = { injectJavaScript: (script: string) => void };
// react-native-webview's class typings don't resolve under React 19's types
// (props collapse to `never`); this is the slice of the API used here.
const WebView = RNWebView as unknown as ComponentType<WebViewProps & { ref?: Ref<WebHandle> }>;

type LatLng = { latitude: number; longitude: number };

/** Straight-line distance in metres (haversine). Not a route length. */
export function distanceMeters(a: LatLng, b: LatLng): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function formatDistance(m: number): string {
  return m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`;
}

function mapHtml(dest: NavigationDestination, dark: boolean, accent: string): string {
  const data = JSON.stringify({ lat: dest.latitude, lng: dest.longitude, label: dest.label });
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>html,body,#m{margin:0;height:100%;background:${dark ? "#15171E" : "#EEF0F5"}}
${dark ? ".leaflet-tile{filter:invert(1) hue-rotate(180deg) brightness(.85) contrast(.9)}" : ""}
.pin{width:18px;height:18px;border-radius:50%;background:${accent};border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.35)}
.me{width:14px;height:14px;border-radius:50%;background:#0A60CC;border:3px solid #fff;box-shadow:0 0 0 6px rgba(10,96,204,.2)}
.leaflet-control-attribution{font-size:9px}</style></head>
<body><div id="m"></div><script>
var d=${data};
var map=L.map('m',{zoomControl:false,attributionControl:true}).setView([d.lat,d.lng],17);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap contributors'}).addTo(map);
L.marker([d.lat,d.lng],{icon:L.divIcon({className:'',html:'<div class="pin"></div>',iconSize:[18,18]})}).addTo(map).bindTooltip(d.label,{permanent:true,direction:'top',offset:[0,-10]});
var me=null,line=null;
window.setMe=function(lat,lng){
  if(me){me.setLatLng([lat,lng]);line.setLatLngs([[lat,lng],[d.lat,d.lng]]);}
  else{me=L.marker([lat,lng],{icon:L.divIcon({className:'',html:'<div class="me"></div>',iconSize:[14,14]})}).addTo(map);
    line=L.polyline([[lat,lng],[d.lat,d.lng]],{color:'${accent}',weight:3,dashArray:'6 8'}).addTo(map);}
  map.fitBounds(L.latLngBounds([[lat,lng],[d.lat,d.lng]]),{padding:[36,36],maxZoom:17});
};
</script></body></html>`;
}

type ZoneMapProps = {
  destination: NavigationDestination;
  height?: number;
  testID?: string;
};

/**
 * Leaflet map of the zone (same OpenStreetMap tiles as the admin MapPicker),
 * in a WebView. If location permission is already granted it adds your
 * position and a dashed straight line with the straight-line distance — never
 * a route; turn-by-turn stays in the phone's maps app (the Navigate button).
 * It never asks for permission itself.
 */
export function ZoneMap({ destination, height = 170, testID }: ZoneMapProps) {
  const colors = useColors();
  const scheme = useColorSchemeResolved();
  const web = useRef<WebHandle>(null);
  const [me, setMe] = useState<LatLng | null>(null);
  const [ready, setReady] = useState(false);
  const html = useMemo(() => mapHtml(destination, scheme === "dark", colors.data[0]), [colors.data, destination, scheme]);

  useEffect(() => {
    let sub: Location.LocationSubscription | null = null;
    let alive = true;
    (async () => {
      try {
        const perm = await Location.getForegroundPermissionsAsync();
        if (!perm.granted || !alive) return;
        sub = await Location.watchPositionAsync({ accuracy: Location.Accuracy.Balanced, distanceInterval: 10 }, (p) =>
          setMe({ latitude: p.coords.latitude, longitude: p.coords.longitude }),
        );
      } catch {
        // No position: the map still shows the zone.
      }
    })();
    return () => {
      alive = false;
      sub?.remove();
    };
  }, []);

  useEffect(() => {
    if (ready && me) web.current?.injectJavaScript(`window.setMe(${me.latitude},${me.longitude});true;`);
  }, [me, ready]);

  const distance = me ? formatDistance(distanceMeters(me, destination)) : null;
  return (
    <View style={styles.wrap} testID={testID}>
      <View style={[styles.map, { height, borderColor: colors.border, backgroundColor: colors.surfaceElevated }]}>
        <WebView
          ref={web}
          source={{ html }}
          originWhitelist={["*"]}
          onLoadEnd={() => setReady(true)}
          scrollEnabled={false}
          accessibilityLabel={`Map of ${destination.label}`}
          testID={testID ? `${testID}-web` : undefined}
        />
        {distance ? (
          <View style={[styles.pill, { backgroundColor: colors.surface, borderColor: colors.border }]} pointerEvents="none">
            <Text variant="caption" color={colors.foreground} testID={testID ? `${testID}-distance` : undefined}>
              {distance} away
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  map: { borderRadius: radii.lg, overflow: "hidden", borderWidth: 1 },
  // Straight-line distance only; the route is the maps app's job.
  pill: {
    position: "absolute",
    left: spacing.md,
    bottom: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.sm,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
