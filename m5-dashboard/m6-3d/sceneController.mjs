import * as THREE from '../vendor/three/three.module.min.js'
import { OrbitControls } from '../vendor/three/OrbitControls.js'
import { resolveNodeSceneState } from './sceneState.mjs'

const canvas = document.getElementById('m6SceneCanvas')
const stage = canvas?.closest('.m6-scene-stage')
const statusText = document.getElementById('m6SceneStatus')
const description = document.getElementById('m6SceneDescription')
const nodeText = document.getElementById('m6SceneNode')
const overlay = document.getElementById('m6SceneOverlay')

if (canvas && stage && statusText && description && nodeText && overlay) {
  let renderer
  let animationFrame = 0
  let activeNodeId = 'dorm-a'
  let fanSpeed = 0.35
  let sceneState = resolveNodeSceneState({ nodeId: activeNodeId })

  try {
    const scene = new THREE.Scene()
    scene.background = new THREE.Color('#f6ebf0')
    scene.fog = new THREE.Fog('#f6ebf0', 14, 25)

    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 60)
    camera.position.set(7.8, 6.2, 9.4)
    camera.lookAt(0, 1.1, 0)

    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.setSize(1, 1, false)
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.target.set(0, 1.1, 0)
    controls.enableDamping = true
    controls.dampingFactor = 0.07
    controls.minDistance = 7
    controls.maxDistance = 16
    controls.minPolarAngle = 0.34
    controls.maxPolarAngle = 1.42
    controls.maxAzimuthAngle = Math.PI * 0.83
    controls.minAzimuthAngle = -Math.PI * 0.83
    controls.update()

    scene.add(new THREE.HemisphereLight('#fffaf5', '#a58a91', 2.2))
    const keyLight = new THREE.DirectionalLight('#fff7eb', 3.2)
    keyLight.position.set(-4, 8, 5)
    keyLight.castShadow = true
    keyLight.shadow.mapSize.set(1024, 1024)
    scene.add(keyLight)

    const materials = {
      floor: new THREE.MeshStandardMaterial({ color: '#decdd5', roughness: 0.88 }),
      wall: new THREE.MeshStandardMaterial({ color: '#fffaf7', roughness: 0.92 }),
      trim: new THREE.MeshStandardMaterial({ color: '#856779', roughness: 0.72 }),
      mattress: new THREE.MeshStandardMaterial({ color: '#f7f0eb', roughness: 0.92 }),
      blanket: new THREE.MeshStandardMaterial({ color: '#bd8290', roughness: 0.86 }),
      wood: new THREE.MeshStandardMaterial({ color: '#bd947a', roughness: 0.78 }),
      metal: new THREE.MeshStandardMaterial({ color: '#77747b', metalness: 0.5, roughness: 0.42 }),
      glass: new THREE.MeshStandardMaterial({ color: '#86b4bd', roughness: 0.22, metalness: 0.04, transparent: true, opacity: 0.8 }),
      device: new THREE.MeshStandardMaterial({ color: '#fff8ec', emissive: '#6c897a', emissiveIntensity: 0.85, roughness: 0.45 }),
      fan: new THREE.MeshStandardMaterial({ color: '#806b7a', roughness: 0.46 })
    }
    const room = new THREE.Group()
    scene.add(room)

    function box(parent, material, size, position, cast = true) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material)
      mesh.position.set(...position)
      mesh.castShadow = cast
      mesh.receiveShadow = true
      parent.add(mesh)
      return mesh
    }

    box(room, materials.floor, [7, 0.22, 5.4], [0, -0.12, 0], false)
    box(room, materials.wall, [7, 3.5, 0.14], [0, 1.63, -2.7], false)
    box(room, materials.wall, [0.14, 3.5, 5.4], [-3.5, 1.63, 0], false)
    box(room, materials.trim, [7, 0.12, 0.16], [0, 0.08, -2.58], false)

    const bed = new THREE.Group()
    bed.position.set(-1.85, 0, -0.1)
    room.add(bed)
    box(bed, materials.wood, [1.75, 0.28, 2.45], [0, 0.35, 0])
    box(bed, materials.mattress, [1.64, 0.34, 2.3], [0, 0.64, 0])
    box(bed, materials.blanket, [1.62, 0.1, 1.18], [0, 0.86, 0.53])
    box(bed, materials.mattress, [0.72, 0.1, 0.42], [0, 0.87, -0.82])
    for (const x of [-0.7, 0.7]) for (const z of [-1.05, 1.05]) box(bed, materials.wood, [0.13, 0.3, 0.13], [x, 0.16, z])

    const desk = new THREE.Group()
    desk.position.set(1.55, 0, -1.15)
    room.add(desk)
    box(desk, materials.wood, [1.75, 0.14, 0.88], [0, 1.28, 0])
    for (const x of [-0.72, 0.72]) for (const z of [-0.32, 0.32]) box(desk, materials.metal, [0.08, 1.25, 0.08], [x, 0.62, z])
    box(desk, materials.device, [0.72, 0.48, 0.08], [0, 1.61, -0.2])
    box(desk, materials.metal, [0.12, 0.13, 0.12], [0, 1.34, -0.2])

    const windowFrame = new THREE.Group()
    windowFrame.position.set(-0.7, 2.05, -2.58)
    room.add(windowFrame)
    box(windowFrame, materials.trim, [2.1, 1.2, 0.13], [0, 0, 0])
    box(windowFrame, materials.glass, [1.88, 0.98, 0.07], [0, 0, 0.08], false)
    box(windowFrame, materials.trim, [0.07, 1.03, 0.05], [0, 0, 0.14], false)
    box(windowFrame, materials.trim, [1.94, 0.07, 0.05], [0, 0, 0.14], false)

    const fan = new THREE.Group()
    fan.position.set(2.75, 0, 0.65)
    room.add(fan)
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.07, 1.14, 12), materials.metal)
    pole.position.y = 0.6
    pole.castShadow = true
    fan.add(pole)
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 18, 12), materials.fan)
    head.position.y = 1.34
    head.castShadow = true
    fan.add(head)
    const blades = new THREE.Group()
    blades.position.y = 1.34
    fan.add(blades)
    for (let index = 0; index < 3; index++) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.055, 0.22), materials.fan)
      blade.position.x = 0.47
      blade.rotation.y = index * Math.PI * 2 / 3
      blade.castShadow = true
      blades.add(blade)
    }
    const fanHub = new THREE.Mesh(new THREE.SphereGeometry(0.13, 14, 10), materials.trim)
    blades.add(fanHub)

    const droplets = new THREE.Group()
    droplets.position.set(-0.7, 2.05, -2.35)
    room.add(droplets)
    const dropletMaterial = new THREE.MeshStandardMaterial({ color: '#72b5ad', transparent: true, opacity: 0.82, roughness: 0.28 })
    const dropletMeshes = []
    for (let index = 0; index < 9; index++) {
      const drop = new THREE.Mesh(new THREE.SphereGeometry(0.07 + (index % 3) * 0.018, 12, 10), dropletMaterial)
      drop.position.set(-0.8 + (index % 3) * 0.8, -0.42 + Math.floor(index / 3) * 0.42, 0)
      drop.userData.phase = index * 0.7
      drop.userData.baseY = drop.position.y
      droplets.add(drop)
      dropletMeshes.push(drop)
    }
    droplets.visible = false

    const stateLamp = new THREE.Mesh(new THREE.SphereGeometry(0.16, 18, 14), materials.device)
    stateLamp.position.set(2.54, 2.35, -2.48)
    room.add(stateLamp)

    const profiles = {
      normal: { background: '#f6ebf0', light: '#fff7eb', window: '#86b4bd', lamp: '#55a789', droplets: false, fan: 0.35 },
      hot: { background: '#f8e2d8', light: '#ffc09a', window: '#e4a173', lamp: '#d76c46', droplets: false, fan: 8 },
      humid: { background: '#e5efeb', light: '#e4fff5', window: '#68afa6', lamp: '#3f8d85', droplets: true, fan: 2.4 },
      cold: { background: '#e9eef3', light: '#d6e7f1', window: '#83aebe', lamp: '#5884a0', droplets: false, fan: 0.15 },
      'hot-humid': { background: '#f6e4df', light: '#ffd1ad', window: '#8cbab2', lamp: '#d76c46', droplets: true, fan: 8 },
      'hot-dry': { background: '#f8e2d8', light: '#ffc09a', window: '#e4a173', lamp: '#d76c46', droplets: false, fan: 8 },
      'cold-humid': { background: '#e5edf0', light: '#d6eced', window: '#68aaa8', lamp: '#5884a0', droplets: true, fan: 1.6 },
      'cold-dry': { background: '#e9eef3', light: '#d6e7f1', window: '#83aebe', lamp: '#5884a0', droplets: false, fan: 0.15 },
      unknown: { background: '#f0ecef', light: '#f6f1f0', window: '#9b9da0', lamp: '#8b8389', droplets: false, fan: 0.25 },
      waiting: { background: '#f0ecef', light: '#f6f1f0', window: '#b8afb4', lamp: '#9e9499', droplets: false, fan: 0 }
    }

    function updateScene(status, context = {}) {
      const nodeId = context.nodeId || activeNodeId
      const record = status === null || status === undefined
        ? null
        : { ...(context.record || {}), nodeId, status }
      sceneState = resolveNodeSceneState({ nodeId, record })
      activeNodeId = sceneState.nodeId || activeNodeId
      const profile = profiles[sceneState.visual] || profiles.unknown
      scene.background.set(profile.background)
      scene.fog.color.set(profile.background)
      keyLight.color.set(profile.light)
      materials.glass.color.set(profile.window)
      materials.device.color.set(profile.lamp)
      materials.device.emissive.set(profile.lamp)
      stateLamp.material.color.set(profile.lamp)
      stateLamp.material.emissive.set(profile.lamp)
      fanSpeed = profile.fan
      droplets.visible = profile.droplets
      stage.dataset.state = sceneState.visual
      nodeText.textContent = sceneState.nodeId || '未知节点'
      const processingIssue = context.issue && context.issue.state === 'processing' ? context.issue : null
      statusText.textContent = processingIssue ? '处理中 · ' + sceneState.status : sceneState.status
      description.textContent = processingIssue
        ? '已执行“' + processingIssue.action + '”。当前环境为“' + sceneState.status + '”；恢复验证 ' + processingIssue.recoverySamples + '/' + (window.DormMateDashboardIssueEvents?.RECOVERY_SAMPLES || 2) + ' 批正常数据。'
        : sceneState.description
      overlay.textContent = sceneState.hasData
        ? (processingIssue ? '处理中 · ' : '') + sceneState.status + (sceneState.temperature !== null && sceneState.humidity !== null ? ' · ' + sceneState.temperature + '℃ / ' + sceneState.humidity + '%' : '')
        : '等待 ' + (sceneState.nodeId || '当前节点') + ' 数据'
      document.querySelectorAll('[data-scene-status]').forEach(button => {
        button.setAttribute('aria-pressed', String(button.dataset.sceneStatus === sceneState.status))
      })
    }

    let previousTime = 0
    function animate(time) {
      animationFrame = window.requestAnimationFrame(animate)
      const delta = Math.min((time - previousTime) / 1000 || 0, 0.05)
      previousTime = time
      blades.rotation.y += fanSpeed * delta
      dropletMeshes.forEach(drop => { drop.position.y = drop.userData.baseY + Math.sin(time / 850 + drop.userData.phase) * 0.045 })
      controls.update()
      renderer.render(scene, camera)
    }

    function resize() {
      const bounds = stage.getBoundingClientRect()
      const width = Math.max(1, Math.floor(bounds.width))
      const height = Math.max(1, Math.floor(bounds.height))
      camera.aspect = width / height
      camera.updateProjectionMatrix()
      renderer.setSize(width, height, false)
    }

    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : null
    if (observer) observer.observe(stage)
    else window.addEventListener('resize', resize)
    resize()
    animationFrame = window.requestAnimationFrame(animate)

    window.addEventListener('dormmate:dashboard-state', event => {
      if (event.detail) updateScene(event.detail.record ? event.detail.record.status : null, event.detail)
    })
    document.querySelectorAll('[data-scene-status]').forEach(button => {
      button.addEventListener('click', () => {
        updateScene(button.dataset.sceneStatus, { nodeId: activeNodeId })
      })
    })
    window.DormMateM6Scene = Object.freeze({ updateScene, get state() { return { ...sceneState } } })
    if (window.DormMateDashboardState) {
      const state = window.DormMateDashboardState
      updateScene(state.record ? state.record.status : null, state)
    } else updateScene(null, { nodeId: activeNodeId })
    window.addEventListener('pagehide', () => {
      window.cancelAnimationFrame(animationFrame)
      if (observer) observer.disconnect()
      else window.removeEventListener('resize', resize)
      controls.dispose()
      renderer.dispose()
    }, { once: true })
  } catch (error) {
    statusText.textContent = '3D 场景初始化失败'
    description.textContent = error && error.message ? error.message : '当前浏览器无法初始化 WebGL。'
    overlay.textContent = '请检查浏览器 WebGL 支持'
    stage.dataset.state = 'error'
    window.DormMateM6Scene = Object.freeze({ updateScene() { return false }, get state() { return { ...sceneState } } })
  }
}
