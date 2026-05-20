import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { StatusCard, formatTime, formatValue } from '../dashboard-config.jsx';

function buildOttoPreview(scene) {
  const robot = new THREE.Group();
  robot.name = 'otto-preview';

  const bodyMaterial = new THREE.MeshStandardMaterial({
    color: 0x5fc0d4,
    roughness: 0.55,
    metalness: 0.08
  });
  const limbMaterial = new THREE.MeshStandardMaterial({
    color: 0xf7f4ec,
    roughness: 0.72
  });
  const footMaterial = new THREE.MeshStandardMaterial({
    color: 0xffbc63,
    roughness: 0.68
  });
  const markerMaterial = new THREE.MeshStandardMaterial({
    color: 0xff667d,
    emissive: 0x3a1018,
    roughness: 0.45
  });

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.082, 0.076, 0.064), bodyMaterial);
  body.position.set(0, 0.154, 0);
  body.castShadow = true;
  robot.add(body);

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.038, 0.044), bodyMaterial);
  head.position.set(0, 0.218, -0.004);
  head.castShadow = true;
  robot.add(head);

  const centerOfMass = new THREE.Mesh(new THREE.SphereGeometry(0.009, 24, 16), markerMaterial);
  centerOfMass.position.set(0.006, 0.154, 0.004);
  robot.add(centerOfMass);

  function createLeg(x) {
    const leg = new THREE.Group();
    leg.position.set(x, 0.118, 0);

    const hip = new THREE.Mesh(new THREE.SphereGeometry(0.011, 18, 12), markerMaterial);
    hip.castShadow = true;
    leg.add(hip);

    const shin = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.007, 0.074, 18), limbMaterial);
    shin.position.set(0, -0.042, 0);
    shin.castShadow = true;
    leg.add(shin);

    const ankle = new THREE.Mesh(new THREE.SphereGeometry(0.009, 18, 12), markerMaterial);
    ankle.position.set(0, -0.081, 0);
    ankle.castShadow = true;
    leg.add(ankle);

    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.014, 0.078), footMaterial);
    foot.position.set(0, -0.092, 0.022);
    foot.castShadow = true;
    foot.receiveShadow = true;
    leg.add(foot);

    robot.add(leg);
    return { leg, foot };
  }

  const left = createLeg(-0.032);
  const right = createLeg(0.032);

  scene.add(robot);

  return {
    robot,
    body,
    centerOfMass,
    leftLeg: left.leg,
    rightLeg: right.leg,
    leftFoot: left.foot,
    rightFoot: right.foot
  };
}

function MetricStrip({ runtime, metrics }) {
  return (
    <div className="status-grid sim-status-grid">
      <StatusCard
        label="MuJoCo"
        value={runtime.loaded ? '已运行' : '未运行'}
        accent={runtime.loaded ? 'good' : 'warn'}
      />
      <StatusCard label="版本" value={runtime.mujocoVersion || '--'} />
      <StatusCard label="步数" value={runtime.stepCount || '--'} />
      <StatusCard label="根高度" value={formatValue(runtime.finalRootZ, ' m')} />
      <StatusCard label="动态位移" value={formatValue(runtime.forwardProgress, ' m')} />
      <StatusCard label="2D 速度" value={formatValue(metrics.speedMps, ' m/s')} />
    </div>
  );
}

export default function Simulation3DPage({
  simulation,
  busy,
  handleExportMuJoCoDraft,
  handleRunMuJoCoSimulation,
  handleStopSimulation
}) {
  const mountRef = useRef(null);
  const viewStateRef = useRef({});
  const dragRef = useRef(null);
  const [playing, setPlaying] = useState(true);
  const [stopped, setStopped] = useState(false);
  const [viewYaw, setViewYaw] = useState(-28);
  const [viewPitch, setViewPitch] = useState(20);
  const [zoom, setZoom] = useState(1);

  const profile = simulation.profiles?.otto || {};
  const currentParams = simulation.currentParams || profile.gaitDefaults || {};
  const metrics = simulation.metrics || {};
  const digitalTwin = simulation.digitalTwin || {};
  const runtime = digitalTwin.runtime || {};
  const modelReady = simulation.modelStatus === 'imported';
  const canRunMuJoCo = Boolean(digitalTwin.xml);

  const modelLabel = useMemo(() => {
    if (!modelReady) {
      return '等待导入 CAD';
    }

    if (runtime.loaded) {
      return 'MuJoCo 已运行';
    }

    return digitalTwin.status === 'mjcf_draft' ? 'MJCF 已生成' : '等待 MJCF';
  }, [digitalTwin.status, modelReady, runtime.loaded]);

  useEffect(() => {
    viewStateRef.current = {
      playing,
      stopped,
      viewYaw,
      viewPitch,
      zoom,
      params: currentParams,
      runtime
    };
  }, [currentParams, playing, runtime, stopped, viewPitch, viewYaw, zoom]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) {
      return undefined;
    }

    mount.addEventListener('wheel', handleStageWheel, { passive: false });

    return () => {
      mount.removeEventListener('wheel', handleStageWheel);
    };
  }, []);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) {
      return undefined;
    }

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x12161d);

    const camera = new THREE.PerspectiveCamera(42, 1, 0.01, 12);
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mount.appendChild(renderer.domElement);

    const hemiLight = new THREE.HemisphereLight(0xbdf5ff, 0x17130f, 1.85);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xffffff, 2.4);
    keyLight.position.set(1.6, 2.4, 1.2);
    keyLight.castShadow = true;
    scene.add(keyLight);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(2.6, 2.6),
      new THREE.MeshStandardMaterial({
        color: 0x1f2a30,
        roughness: 0.84,
        metalness: 0.04
      })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    const grid = new THREE.GridHelper(2.6, 26, 0x60bfd5, 0x34424a);
    grid.material.opacity = 0.38;
    grid.material.transparent = true;
    scene.add(grid);

    const preview = buildOttoPreview(scene);
    let frameId = 0;

    function resize() {
      const width = mount.clientWidth || 900;
      const height = mount.clientHeight || 560;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    }

    function animate() {
      const state = viewStateRef.current;
      const elapsed = performance.now() / 1000;
      const params = state.params || {};
      const hipSwing = THREE.MathUtils.degToRad(Number(params.hipSwingDeg || 12));
      const kneeLift = THREE.MathUtils.degToRad(Number(params.kneeLiftDeg || 16));
      const torsoLead = THREE.MathUtils.degToRad(Number(params.torsoLeadDeg || 0));
      const runtimeProgress = Number(state.runtime?.forwardProgress || 0);
      const phase = state.stopped ? 0 : state.playing ? elapsed * 5.2 : 0.9;
      const stride = Math.sin(phase);
      const counterStride = Math.sin(phase + Math.PI);
      const lift = Math.max(0, Math.sin(phase)) * kneeLift * 0.22;
      const counterLift = Math.max(0, Math.sin(phase + Math.PI)) * kneeLift * 0.22;

      preview.robot.position.y = 0.012 + Math.abs(Math.sin(phase * 2)) * 0.004;
      preview.robot.position.z = Math.sin(phase * 0.5) * 0.006 + runtimeProgress * 0.05;
      preview.body.rotation.x = -torsoLead;
      preview.centerOfMass.position.x = THREE.MathUtils.clamp(torsoLead * 0.045, -0.018, 0.018);
      preview.leftLeg.rotation.x = stride * hipSwing * 0.85 - lift;
      preview.rightLeg.rotation.x = counterStride * hipSwing * 0.85 - counterLift;
      preview.leftLeg.rotation.z = Math.sin(phase + 0.4) * hipSwing * 0.18;
      preview.rightLeg.rotation.z = -Math.sin(phase + 0.4) * hipSwing * 0.18;
      preview.leftFoot.rotation.x = -preview.leftLeg.rotation.x * 0.35;
      preview.rightFoot.rotation.x = -preview.rightLeg.rotation.x * 0.35;

      const yaw = THREE.MathUtils.degToRad(state.viewYaw ?? -28);
      const pitch = THREE.MathUtils.degToRad(state.viewPitch ?? 20);
      const radius = 0.54 / Number(state.zoom || 1);
      camera.position.set(
        Math.sin(yaw) * Math.cos(pitch) * radius,
        0.18 + Math.sin(pitch) * radius,
        Math.cos(yaw) * Math.cos(pitch) * radius
      );
      camera.lookAt(0, 0.106, 0);

      renderer.render(scene, camera);
      frameId = window.requestAnimationFrame(animate);
    }

    resize();
    animate();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(mount);

    return () => {
      window.cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      renderer.dispose();
      scene.traverse((object) => {
        if (object.geometry) {
          object.geometry.dispose();
        }
        if (object.material) {
          if (Array.isArray(object.material)) {
            object.material.forEach((material) => material.dispose());
          } else {
            object.material.dispose();
          }
        }
      });
      renderer.domElement.remove();
    };
  }, []);

  function handlePointerDown(event) {
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      yaw: viewYaw,
      pitch: viewPitch
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    setViewYaw(drag.yaw + (event.clientX - drag.startX) * 0.28);
    setViewPitch(Math.max(-4, Math.min(58, drag.pitch + (drag.startY - event.clientY) * 0.22)));
  }

  function handlePointerUp(event) {
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null;
    }
  }

  function handleStageWheel(event) {
    event.preventDefault();
    const nextZoomDelta = -event.deltaY * 0.0012;
    setZoom((current) => Math.max(0.65, Math.min(1.45, current + nextZoomDelta)));
  }

  async function stopPreviewAndSimulation() {
    setPlaying(false);
    setStopped(true);
    await handleStopSimulation();
  }

  async function runMuJoCoAndPlay() {
    setStopped(false);
    setPlaying(true);
    await handleRunMuJoCoSimulation();
  }

  return (
    <section className="grid page-content simulation-3d-workbench">
      <article className="panel wide-panel simulation-3d-topbar">
        <div>
          <p className="eyebrow">MuJoCo Preview</p>
          <h2>OTTO 3D 仿真工作台</h2>
          <p className="panel-note">
            当前是网页 3D 预览，使用近似几何承接 MuJoCo 运行结果；STEP 网格转换完成后会替换成真实模型外形。
          </p>
        </div>
        <div className="button-row">
          <a className="button-link ghost" href="#simulation">
            返回 2D 仿真
          </a>
          <button className="ghost" onClick={handleExportMuJoCoDraft} disabled={busy.simulation || !modelReady}>
            生成 MJCF
          </button>
          <button className="accent" onClick={runMuJoCoAndPlay} disabled={busy.simulation || !canRunMuJoCo}>
            运行 MuJoCo
          </button>
          <button className="danger" onClick={stopPreviewAndSimulation} disabled={busy.simulation}>
            停止
          </button>
        </div>
      </article>

      <div className="simulation-3d-layout">
        <article className="panel simulation-3d-stage-panel">
          <div
            ref={mountRef}
            className="simulation-3d-stage"
            role="img"
            aria-label="OTTO 三维步态预览"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          >
            <div className="simulation-3d-overlay">
              <span>{modelLabel}</span>
              <span>{stopped ? '已停止' : playing ? '播放中' : '已暂停'}</span>
            </div>
          </div>
        </article>

        <aside className="panel simulation-3d-side">
          <div className="panel-head">
            <h2>场景控制</h2>
            <span className="muted">{formatTime(runtime.ranAt || digitalTwin.exportedAt)}</span>
          </div>

          <div className="button-row">
            <button onClick={() => {
              setStopped(false);
              setPlaying((current) => !current);
            }}>
              {playing ? '暂停' : '播放'}
            </button>
            <button className="danger" onClick={stopPreviewAndSimulation} disabled={busy.simulation}>
              停止
            </button>
            <button className="ghost" onClick={() => {
              setViewYaw(-28);
              setViewPitch(20);
              setZoom(1);
            }}>
              重置视角
            </button>
          </div>

          <div className="simulation-3d-controls">
            <label className="field">
              <span>水平视角</span>
              <input
                type="range"
                min="-180"
                max="180"
                value={viewYaw}
                onChange={(event) => setViewYaw(Number(event.target.value))}
              />
            </label>
            <label className="field">
              <span>俯仰视角</span>
              <input
                type="range"
                min="-4"
                max="58"
                value={viewPitch}
                onChange={(event) => setViewPitch(Number(event.target.value))}
              />
            </label>
            <label className="field">
              <span>缩放</span>
              <input
                type="range"
                min="0.65"
                max="1.45"
                step="0.01"
                value={zoom}
                onChange={(event) => setZoom(Number(event.target.value))}
              />
            </label>
          </div>

          <MetricStrip runtime={runtime} metrics={metrics} />

          <div className="info-table simulation-3d-info">
            <div className="info-row">
              <span>源 CAD</span>
              <strong>{digitalTwin.sourceCad || profile.geometry?.primaryCad || '--'}</strong>
            </div>
            <div className="info-row">
              <span>显示几何</span>
              <strong>盒体 / 圆柱近似</strong>
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}
