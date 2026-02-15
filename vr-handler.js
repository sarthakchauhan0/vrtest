
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
        panoGroup: null, // Container for alignment

        init: function () {
            if (this.initialized) return;

            try {
                // Create Three.js renderer
                this.renderer = new THREE.WebGLRenderer({ antialias: true });
                this.renderer.setPixelRatio(window.devicePixelRatio);
                this.renderer.setSize(window.innerWidth, window.innerHeight);
                this.renderer.xr.enabled = true;

                // Handle session end/start
                this.renderer.xr.addEventListener('sessionend', () => {
                    this.renderer.domElement.style.display = 'none';
                    if (this.errorLog.length > 0) {
                        this.showToast(this.errorLog.join('\n'));
                        this.errorLog = [];
                    }
                });

                this.renderer.xr.addEventListener('sessionstart', () => {
                    this.renderer.domElement.style.display = 'block';
                    console.log('VRHandler: Session started');
                });

                // Append canvas
                this.renderer.domElement.style.display = 'none';
                this.renderer.domElement.style.position = 'absolute';
                this.renderer.domElement.style.top = '0';
                this.renderer.domElement.style.left = '0';
                this.renderer.domElement.style.zIndex = '999';
                document.body.appendChild(this.renderer.domElement);

                // Add VR Button
                document.body.appendChild(VRButton.createButton(this.renderer));

                // Create scene & camera
                this.scene = new THREE.Scene();
                this.scene.background = new THREE.Color(0x101010); // Dark grey background for void

                this.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 1000);
                this.scene.add(this.camera);

                // Create wrapper group for content alignment
                this.panoGroup = new THREE.Group();
                // We assume the panorama was taken at eye-level approx 1.6m. 
                // We lift the content so (0,0,0) of the content matches (0, 1.6, 0) of the tracking space.
                this.panoGroup.position.set(0, 1.6, 0);
                this.scene.add(this.panoGroup);

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
            }, 5000 * Math.max(1, this.errorLog.length));
        },

        loadScene: function (sceneData) {
            console.log('VRHandler: loadScene called with', sceneData ? sceneData.id : 'null');
            if (!this.initialized) this.init();
            if (!sceneData) {
                this.logError('Scene data is missing');
                return;
            }

            // Clear previous pano mesh
            var oldMesh = this.panoGroup.getObjectByName('panoMesh');
            if (oldMesh) {
                this.panoGroup.remove(oldMesh);
                if (oldMesh.geometry) oldMesh.geometry.dispose();
                if (Array.isArray(oldMesh.material)) {
                    oldMesh.material.forEach(m => m.dispose());
                } else if (oldMesh.material) {
                    oldMesh.material.dispose();
                }
            }

            var path = 'tiles/' + sceneData.id + '/1/';
            console.log('VRHandler: Loading textures from', path);

            // Three.js BoxGeometry face order: +x, -x, +y, -y, +z, -z
            // Marzipano mappings:
            // r (+x), l (-x), u (+y), d (-y), f (-z), b (+z)
            // Note: In Three.js, +z is BACK, -z is FRONT.
            // So we need: r, l, u, d, b, f
            var urls = [
                path + 'r/0/0.jpg', // Right (+x)
                path + 'l/0/0.jpg', // Left (-x)
                path + 'u/0/0.jpg', // Up (+y)
                path + 'd/0/0.jpg', // Down (-y)
                path + 'b/0/0.jpg', // Back (+z)
                path + 'f/0/0.jpg'  // Front (-z)
            ];

            var loader = new THREE.TextureLoader();
            var materials = [];

            var loadedCount = 0;
            var loadTexture = (url) => {
                return new Promise((resolve, reject) => {
                    loader.load(url,
                        (tex) => resolve(tex),
                        undefined,
                        (err) => reject(err)
                    );
                });
            };

            Promise.all(urls.map(url => loadTexture(url)))
                .then(textures => {
                    console.log('VRHandler: All textures loaded');
                    textures.forEach(tex => {
                        materials.push(new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide }));
                    });

                    // Create Box Mesh
                    var geometry = new THREE.BoxGeometry(100, 100, 100);
                    var mesh = new THREE.Mesh(geometry, materials);
                    mesh.name = 'panoMesh';

                    // Invert scale not needed because we used side: BackSide and correct face mapping
                    // But verify Left/Right mirroring.
                    // Usually Inside a box, +x is Right if we look -z.
                    // Let's stick to standard.

                    this.panoGroup.add(mesh);
                })
                .catch(err => {
                    console.error('VRHandler: Error loading textures', err);
                    this.logError('Texture Load Failed: ' + (err.message || 'Network error'));
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

                var geometry = new THREE.SphereGeometry(0.2, 32, 32);
                var material = new THREE.MeshBasicMaterial({ color: 0xffffff });
                var sphere = new THREE.Mesh(geometry, material);

                sphere.position.set(x, y, z);
                sphere.userData = { target: hotspotData.target };

                this.panoGroup.add(sphere); // Add to panoGroup so it aligns with skybox
                this.hotspotObjects.push(sphere);
            } catch (e) {
                this.logError('Hotspot Creation Error: ' + e.message);
            }
        },

        clearHotspots: function () {
            this.hotspotObjects.forEach(obj => {
                this.panoGroup.remove(obj);
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
            var controller = event.target;
            controller.userData.isSelecting = true;
        },

        onSelectEnd: function (event) {
            var controller = event.target;
            controller.userData.isSelecting = false;

            // Check for intersections
            // Note: Raycasting needs to account for panoGroup position?
            // raycaster.intersectObjects(this.hotspotObjects) works in world space.
            // hotspotObjects are children of panoGroup.
            // three.js handles world matrix automatically.

            var intersections = this.getIntersections(controller);
            if (intersections.length > 0) {
                console.log('VRHandler: Intersection detected');
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
            if (this.renderer && this.scene && this.camera) {
                this.renderer.render(this.scene, this.camera);
            }
            this.updateIntersections();
        },

        updateIntersections: function () {
            // Optional highlighting
        }
    };

    window.VRHandler = VRHandler;

    function findSceneDataById(id) {
        if (window.APP_DATA && window.APP_DATA.scenes) {
            return window.APP_DATA.scenes.find(s => s.id === id);
        }
        return null;
    }

})();
