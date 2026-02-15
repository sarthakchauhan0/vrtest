
(function () {
    var VRHandler = {
        renderer: null,
        scene: null,
        camera: null,
        initialized: false,
        hotspotObjects: [],
        controllers: [],
        raycaster: null,
        intersected: [],
        tempMatrix: null,

        init: function () {
            if (this.initialized) return;

            // Create Three.js renderer
            this.renderer = new THREE.WebGLRenderer({ antialias: true });
            this.renderer.setPixelRatio(window.devicePixelRatio);
            this.renderer.setSize(window.innerWidth, window.innerHeight);
            this.renderer.xr.enabled = true;

            // Add VR Button
            document.body.appendChild(VRButton.createButton(this.renderer));

            // Create scene
            this.scene = new THREE.Scene();

            // Create camera
            this.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 1000);
            this.scene.add(this.camera); // Add camera to scene for controllers to be attached relative to it (usually rig)

            // Controllers
            this.raycaster = new THREE.Raycaster();
            this.tempMatrix = new THREE.Matrix4();

            var controller1 = this.renderer.xr.getController(0);
            controller1.addEventListener('selectstart', this.onSelectStart.bind(this));
            controller1.addEventListener('selectend', this.onSelectEnd.bind(this));
            this.scene.add(controller1);
            this.controllers.push(controller1);

            var controller2 = this.renderer.xr.getController(1);
            controller2.addEventListener('selectstart', this.onSelectStart.bind(this));
            controller2.addEventListener('selectend', this.onSelectEnd.bind(this));
            this.scene.add(controller2);
            this.controllers.push(controller2);

            // Controller visualizers
            var controllerModelFactory = {
                // Basic line for now. Ideally use XRControllerModelFactory but keeping it simple to avoid more deps
                createVisualizer: function () {
                    var geometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)]);
                    var line = new THREE.Line(geometry);
                    line.scale.z = 5;
                    return line;
                }
            };

            var geometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, - 1)]);
            var line = new THREE.Line(geometry);
            line.name = 'line';
            line.scale.z = 5;

            controller1.add(line.clone());
            controller2.add(line.clone());

            this.initialized = true;

            // Handle resize
            window.addEventListener('resize', this.onWindowResize.bind(this), false);

            // Start loop
            this.renderer.setAnimationLoop(this.animate.bind(this));
        },

        loadScene: function (sceneData) {
            if (!this.initialized) this.init();

            // Load textures
            // Marzipano tiles: tiles/{id}/1/{face}/0/0.jpg
            // Mapping: px=r, nx=l, py=u, ny=d, pz=f, nz=b
            var loader = new THREE.CubeTextureLoader();
            var path = 'tiles/' + sceneData.id + '/1/';

            // ThreeJS expects: px, nx, py, ny, pz, nz
            // Marzipano faces: r, l, u, d, f, b
            var urls = [
                path + 'r/0/0.jpg', // px - right
                path + 'l/0/0.jpg', // nx - left
                path + 'u/0/0.jpg', // py - up
                path + 'd/0/0.jpg', // ny - down
                path + 'f/0/0.jpg', // pz - front
                path + 'b/0/0.jpg'  // nz - back
            ];

            loader.load(urls, (texture) => {
                this.scene.background = texture;
            });

            // Clear existing hotspots
            this.clearHotspots();

            // Create new hotspots
            if (sceneData.linkHotspots) {
                sceneData.linkHotspots.forEach(hotspot => {
                    this.createHotspot(hotspot);
                });
            }
        },

        createHotspot: function (hotspotData) {
            // Convert Yaw/Pitch to Cartesian
            // Marzipano coords: Yaw is rotation around Y axis. Pitch is rotation around X axis (local).
            // Standard spherical to cartesian conversion.
            // x = r * sin(theta) * cos(phi)
            // y = r * sin(phi)
            // z = r * cos(theta) * cos(phi)
            // But verify Marzipano coordinate system.
            // Marzipano: yaw=0 is center of 'f' face?
            // If yaw=0, pitch=0 -> pointing at -Z (front) in Three.js?

            // Let's assume standard definitions:
            // Yaw: rotation around Y. 0 = -Z
            // Pitch: elevation.

            var radius = 10;
            var phi = hotspotData.pitch; // Elevation (-PI/2 to PI/2)
            var theta = hotspotData.yaw; // Azimuth

            // Conversion logic to align with Three.js camera looking at -Z
            // x = -radius * Math.sin(theta) * Math.cos(phi);
            // y = radius * Math.sin(phi);
            // z = -radius * Math.cos(theta) * Math.cos(phi);

            var x = -radius * Math.sin(theta) * Math.cos(phi);
            var y = radius * Math.sin(phi);
            var z = -radius * Math.cos(theta) * Math.cos(phi);

            var geometry = new THREE.SphereGeometry(0.5, 32, 32);
            var material = new THREE.MeshBasicMaterial({ color: 0xff0000 });
            var sphere = new THREE.Mesh(geometry, material);

            sphere.position.set(x, y, z);
            sphere.userData = { target: hotspotData.target };

            this.scene.add(sphere);
            this.hotspotObjects.push(sphere);
        },

        clearHotspots: function () {
            this.hotspotObjects.forEach(obj => {
                this.scene.remove(obj);
                if (obj.geometry) obj.geometry.dispose();
                if (obj.material) obj.material.dispose();
            });
            this.hotspotObjects = [];
        },

        onWindowResize: function () {
            // We don't resize renderer if in VR, usually handled by WebXR manager, but for window resizing in preview:
            if (!this.renderer.xr.isPresenting) {
                this.camera.aspect = window.innerWidth / window.innerHeight;
                this.camera.updateProjectionMatrix();
                this.renderer.setSize(window.innerWidth, window.innerHeight);
            }
        },

        onSelectStart: function (event) {
            var controller = event.target;
            controller.userData.isSelecting = true;
        },

        onSelectEnd: function (event) {
            var controller = event.target;
            controller.userData.isSelecting = false;

            // Check for intersections
            var intersections = this.getIntersections(controller);
            if (intersections.length > 0) {
                var intersection = intersections[0];
                var object = intersection.object;
                this.handleHotspotClick(object);
            }
        },

        getIntersections: function (controller) {
            this.tempMatrix.identity().extractRotation(controller.matrixWorld);
            this.raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
            this.raycaster.ray.direction.set(0, 0, - 1).applyMatrix4(this.tempMatrix);
            return this.raycaster.intersectObjects(this.hotspotObjects);
        },

        handleHotspotClick: function (object) {
            if (object.userData.target) {
                // Find scene data
                var targetId = object.userData.target;
                var sceneData = findSceneDataById(targetId); // Helper function needed

                if (sceneData) {
                    this.loadScene(sceneData);
                    // Also update existing non-VR viewer if possible, or synchronize state
                    // Trigger global event or call global function
                    if (window.switchSceneById) {
                        window.switchSceneById(targetId);
                    }
                }
            }
        },

        animate: function () {
            // Render
            this.renderer.render(this.scene, this.camera);

            // Update controller visual feedback (highlighting hotspots)
            this.updateIntersections();
        },

        updateIntersections: function () {
            // Optional: highlight hotspots when hovering
            // For now, keep it simple.
        }
    };

    window.VRHandler = VRHandler;

    // Helper to find data (duplicated logic, but simple enough)
    function findSceneDataById(id) {
        if (window.APP_DATA && window.APP_DATA.scenes) {
            return window.APP_DATA.scenes.find(s => s.id === id);
        }
        return null;
    }

})();
