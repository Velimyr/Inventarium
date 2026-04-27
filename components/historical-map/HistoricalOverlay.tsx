import { useEffect, useMemo, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import { STYLES, getDivisionColorMap, getStripePattern } from './constants';
import { usePeriodData } from './usePeriodData';
import { useIsDark } from './useIsDark';
import type { AreaFeatureProperties } from './types';

const LEVEL2_ZOOM = 7;
const LEVEL3_ZOOM = 8;

function applyLabelOpacity(zoom: number) {
  document.querySelectorAll<HTMLElement>('.level2-city-label').forEach((el) => {
    el.style.opacity = zoom < LEVEL2_ZOOM ? '0' : '1';
  });
  document.querySelectorAll<HTMLElement>('.level3-city-label').forEach((el) => {
    el.style.opacity = zoom < LEVEL3_ZOOM ? '0' : '1';
  });
}

interface Props {
  periodId: string;
  onHover?: (props: AreaFeatureProperties | null) => void;
  showVoievodstvoCenters?: boolean;
  showStarostvoCenters?: boolean;
}

export default function HistoricalOverlay({
  periodId,
  onHover,
  showVoievodstvoCenters = true,
  showStarostvoCenters = true,
}: Props) {
  const map = useMap();
  const isDark = useIsDark();
  const isDarkRef = useRef(isDark);
  isDarkRef.current = isDark;

  const { data } = usePeriodData(periodId);

  const layerGroup = useMemo(() => L.layerGroup(), []);
  const regionsLayerRef = useRef<L.GeoJSON | null>(null);
  const bordersLayerRef = useRef<L.GeoJSON | null>(null);

  useEffect(() => {
    if (!map) return;

    const panes: Array<[string, number]> = [
      ['historicalRegionsPane', 450],
      ['historicalBordersPane', 550],
      ['historicalCitiesPane', 620],
    ];
    for (const [name, zIndex] of panes) {
      if (!map.getPane(name)) {
        map.createPane(name);
        const pane = map.getPane(name)!;
        pane.style.zIndex = String(zIndex);
        pane.style.pointerEvents = name === 'historicalRegionsPane' ? '' : 'none';
      }
    }

    try {
      getStripePattern().addTo(map);
    } catch {}

    layerGroup.addTo(map);

    const handleZoom = () => applyLabelOpacity(map.getZoom());
    map.on('zoomend', handleZoom);

    return () => {
      map.off('zoomend', handleZoom);
      layerGroup.remove();
    };
  }, [map, layerGroup]);

  useEffect(() => {
    if (!map || !data) return;

    const divisionColorMap = getDivisionColorMap();

    let highlighted: L.Path | null = null;
    const regionsLayer = L.geoJSON(data.areas, {
      pane: 'historicalRegionsPane',
      style: (feature) => {
        const base = isDarkRef.current ? STYLES.DarkFeatureStyle : STYLES.BaseFeatureStyle;
        const fill = divisionColorMap[feature?.properties?.higherDivision];
        return {
          ...base,
          ...(typeof fill === 'string' ? { fillColor: fill } : { fillPattern: fill }),
        } as any;
      },
      onEachFeature: (feature, layer) => {
        layer.on({
          mouseover: (e) => {
            const target = e.target as L.Path;
            if (highlighted && highlighted !== target) regionsLayer.resetStyle(highlighted);
            highlighted = target;
            target.setStyle(isDarkRef.current ? STYLES.DarkHoverFeatureStyle : STYLES.HoverFeatureStyle);
            target.bringToFront();
            onHover?.(feature.properties as AreaFeatureProperties);
          },
          mouseout: (e) => {
            const target = e.target as L.Path;
            regionsLayer.resetStyle(target);
            if (highlighted === target) highlighted = null;
            onHover?.(null);
          },
          click: (e) => {
            const target = e.target as L.Polygon;
            map.fitBounds(target.getBounds());
          },
        });
      },
    });

    const bordersLayer = L.geoJSON(data.borders, {
      pane: 'historicalBordersPane',
      style: () => (isDarkRef.current ? STYLES.DarkBorderStyle : STYLES.BaseBorderStyle),
    });

    const filterPrimary = (f: GeoJSON.Feature) => f.properties!.adminLevel !== 3;
    const filterSecondary = (f: GeoJSON.Feature) => f.properties!.adminLevel === 3;

    const buildCitiesLayer = (filterFn: (f: GeoJSON.Feature) => boolean) =>
      L.geoJSON(data.points, {
        pane: 'historicalCitiesPane',
        filter: filterFn,
        pointToLayer: (feature, coords) => {
          const adminLevel = feature.properties!.adminLevel as number;
          let labelClass = '';
          let radius: number;
          let fillColor: string;
          if (adminLevel === 1) {
            labelClass = 'level1-city-label';
            radius = 8;
            fillColor = STYLES.MarkerFillColors.LEVEL1;
          } else if (adminLevel === 2) {
            labelClass = 'level2-city-label';
            radius = 4;
            fillColor = STYLES.MarkerFillColors.LEVEL2;
          } else {
            labelClass = 'level3-city-label';
            radius = 3;
            fillColor = STYLES.MarkerFillColors.LEVEL3;
          }
          return L.circleMarker(coords, {
            ...STYLES.BaseMarkerStyle,
            radius,
            fillColor,
            pane: 'historicalCitiesPane',
          }).bindTooltip(feature.properties!.name as string, {
            permanent: true,
            className: labelClass,
          });
        },
      });

    const citiesPrimary = showVoievodstvoCenters ? buildCitiesLayer(filterPrimary) : null;
    const citiesSecondary = showStarostvoCenters ? buildCitiesLayer(filterSecondary) : null;

    layerGroup.addLayer(regionsLayer);
    layerGroup.addLayer(bordersLayer);
    if (citiesPrimary) layerGroup.addLayer(citiesPrimary);
    if (citiesSecondary) layerGroup.addLayer(citiesSecondary);

    regionsLayerRef.current = regionsLayer;
    bordersLayerRef.current = bordersLayer;

    setTimeout(() => applyLabelOpacity(map.getZoom()), 50);

    return () => {
      layerGroup.removeLayer(regionsLayer);
      layerGroup.removeLayer(bordersLayer);
      if (citiesPrimary) layerGroup.removeLayer(citiesPrimary);
      if (citiesSecondary) layerGroup.removeLayer(citiesSecondary);
      regionsLayerRef.current = null;
      bordersLayerRef.current = null;
    };
  }, [map, data, layerGroup, onHover, showVoievodstvoCenters, showStarostvoCenters]);

  // Restyle on theme change
  useEffect(() => {
    const divisionColorMap = getDivisionColorMap();
    if (regionsLayerRef.current) {
      regionsLayerRef.current.setStyle((feature) => {
        const base = isDark ? STYLES.DarkFeatureStyle : STYLES.BaseFeatureStyle;
        const fill = divisionColorMap[feature?.properties?.higherDivision];
        return {
          ...base,
          ...(typeof fill === 'string' ? { fillColor: fill } : { fillPattern: fill }),
        } as any;
      });
    }
    if (bordersLayerRef.current) {
      bordersLayerRef.current.setStyle(() => (isDark ? STYLES.DarkBorderStyle : STYLES.BaseBorderStyle));
    }
  }, [isDark]);

  return null;
}
