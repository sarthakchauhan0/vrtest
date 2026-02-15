
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
        errorLog: [], // Store errors

        init: function () {
            if (this.initialized) return;

            try {
                // Create Three.js renderer
                this.renderer = new THREE.WebGLRenderer({ antialias: true });
                this.renderer.setPixelRatio(window.devicePixelRatio);
                this.renderer.setSize(window.innerWidth, window.innerHeight);
                this.renderer.xr.enabled = true;

                // Handle session end to show errors
                this.renderer.xr.addEventListener('sessionend', () => {
                    this.renderer.domElement.style.display = 'none'; // Hide canvas
                    if (window.MarzipanoViewer) { // Optional: Resume Marzipano if needed
                        // Logic to resume main viewer if paused
                    }
                    if (this.errorLog.length > 0) {
                        this.showToast(this.errorLog.join('\n'));
                        this.errorLog = []; // Clear after showing
                    }
                });

                this.renderer.xr.addEventListener('sessionstart', () => {
                    this.renderer.domElement.style.display = 'block'; // Show canvas
                    console.log('VRHandler: Session started');
                });

                // Append canvas to DOM
                this.renderer.domElement.style.display = 'none'; // Hidden by default
                this.renderer.domElement.style.position = 'absolute';
                this.renderer.domElement.style.top = '0';
                this.renderer.domElement.style.left = '0';
                this.renderer.domElement.style.zIndex = '999'; // On top when active
                document.body.appendChild(this.renderer.domElement);

                // Add VR Button
                document.body.appendChild(VRButton.createButton(this.renderer));

                // Create scene
                this.scene = new THREE.Scene();

                // Create camera
                this.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 1000);
                this.scene.add(this.camera);

                // DEBUG: Add visual aid to confirm renderer is working
                this.scene.background = new THREE.Color(0x505050); // Grey background

                var debugGeo = new THREE.BoxGeometry(1, 1, 1);
                var debugMat = new THREE.MeshNormalMaterial();
                this.debugCube = new THREE.Mesh(debugGeo, debugMat);
                this.debugCube.position.set(0, 1.5, -2); // In front of user
                this.scene.add(this.debugCube);

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
                console.log('VRHandler: Starting animation loop');
                this.renderer.setAnimationLoop(this.animate.bind(this));
            } catch (e) {
                this.logError('Init Error: ' + e.message);
            }
        },

        logError: function (msg) {
            console.error('VRHandler Error:', msg);
            this.errorLog.push(msg);
        },

        showToast: function (msg) {
            var toast = document.createElement('div');
            toast.style.position = 'fixed';
            toast.style.bottom = '20px';
            toast.style.left = '50%';
            toast.style.transform = 'translateX(-50%)';
            toast.style.backgroundColor = 'rgba(255, 0, 0, 0.9)';
            toast.style.color = 'white';
            toast.style.padding = '15px 25px';
            toast.style.borderRadius = '5px';
            toast.style.zIndex = '10000';
            toast.style.maxWidth = '80%';
            toast.style.wordWrap = 'break-word';
            toast.style.fontFamily = 'sans-serif';
            toast.innerText = 'VR Error: ' + msg;

            document.body.appendChild(toast);

            setTimeout(() => {
                if (toast.parentNode) {
                    toast.parentNode.removeChild(toast);
                }
            }, 5000 * Math.max(1, this.errorLog.length)); // Show longer if multiple errors
        },

        loadScene: function (sceneData) {
            console.log('VRHandler: loadScene called with', sceneData ? sceneData.id : 'null');
            if (!this.initialized) this.init();
            if (!sceneData) {
                this.logError('Scene data is missing');
                return;
            }

            // Load textures
            var loader = new THREE.CubeTextureLoader();
            var path = 'tiles/' + sceneData.id + '/1/';

            console.log('VRHandler: Loading textures from', path);

            var urls = [
                path + 'r/0/0.jpg', // px - right
                path + 'l/0/0.jpg', // nx - left
                path + 'u/0/0.jpg', // py - up
                path + 'd/0/0.jpg', // ny - down
                path + 'f/0/0.jpg', // pz - front
                path + 'b/0/0.jpg'  // nz - back
            ];

            loader.load(urls, (texture) => {
                console.log('VRHandler: Texture loaded successfully');
                this.scene.background = texture;
            }, undefined, (err) => {
                console.error('VRHandler: Error loading textures', err);
                this.logError('Texture Load Failed: ' + (err.message || 'Unknown network error'));
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
            try {
                var radius = 10;
                var phi = hotspotData.pitch; // Elevation (-PI/2 to PI/2)
                var theta = hotspotData.yaw; // Azimuth

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
            } catch (e) {
                this.logError('Hotspot Creation Error: ' + e.message);
            }
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
            if (this.renderer && this.renderer.xr && !this.renderer.xr.isPresenting) {
                this.camera.aspect = window.innerWidth / window.innerHeight;
                this.camera.updateProjectionMatrix();
                this.renderer.setSize(window.innerWidth, window.innerHeight);
            }
        },

        onSelectStart: function (event) {
            console.log('VRHandler: Controller selectstart event');
            var controller = event.target;
            controller.userData.isSelecting = true;
        },

        onSelectEnd: function (event) {
            console.log('VRHandler: Controller selectend event');
            var controller = event.target;
            controller.userData.isSelecting = false;

            // Check for intersections
            var intersections = this.getIntersections(controller);
            if (intersections.length > 0) {
                console.log('VRHandler: Intersection detected on selectend');
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
            console.log('VRHandler: Hotspot clicked', object.userData.target);
            if (object.userData.target) {
                // Find scene data
                var targetId = object.userData.target;
                var sceneData = findSceneDataById(targetId);

                if (sceneData) {
                    console.log('VRHandler: Loading target scene', targetId);
                    this.loadScene(sceneData);

                    if (window.switchSceneById) {
                        window.switchSceneById(targetId);
                    }
                } else {
                    var msg = 'Target scene data not found for ID: ' + targetId;
                    console.warn('VRHandler:', msg);
                    this.logError(msg);
                }
            }
        },

        animate: function () {
            // Render
            if (this.renderer && this.scene && this.camera) {
                if (this.debugCube) {
                    this.debugCube.rotation.x += 0.01;
                    this.debugCube.rotation.y += 0.01;
                }
                this.renderer.render(this.scene, this.camera);
            }

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
