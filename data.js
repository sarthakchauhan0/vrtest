var APP_DATA = {
  "scenes": [
    {
      "id": "0-first-f-view-1",
      "name": "first f view 1",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        },
        {
          "tileSize": 512,
          "size": 2048
        }
      ],
      "faceSize": 2048,
      "initialViewParameters": {
        "pitch": 0,
        "yaw": 0,
        "fov": 1.5707963267948966
      },
      "linkHotspots": [
        {
          "yaw": -0.5460461108155759,
          "pitch": 0.1836991301951656,
          "rotation": 3.9269908169872414,
          "target": "1-ug-view-1"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "1-ug-view-1",
      "name": "ug view 1",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        },
        {
          "tileSize": 512,
          "size": 2048
        }
      ],
      "faceSize": 2048,
      "initialViewParameters": {
        "yaw": -0.04258284658148703,
        "pitch": 0.016547317228388536,
        "fov": 1.38217411905719
      },
      "linkHotspots": [
        {
          "yaw": 1.1119028837165423,
          "pitch": -0.012123396488952665,
          "rotation": 0,
          "target": "2-ug-view-2"
        },
        {
          "yaw": 1.3646794649459508,
          "pitch": -0.055635932895338414,
          "rotation": 7.0685834705770345,
          "target": "0-first-f-view-1"
        }
      ],
      "infoHotspots": []
    },
    {
      "id": "2-ug-view-2",
      "name": "ug view 2",
      "levels": [
        {
          "tileSize": 256,
          "size": 256,
          "fallbackOnly": true
        },
        {
          "tileSize": 512,
          "size": 512
        },
        {
          "tileSize": 512,
          "size": 1024
        },
        {
          "tileSize": 512,
          "size": 2048
        }
      ],
      "faceSize": 2048,
      "initialViewParameters": {
        "pitch": 0,
        "yaw": 0,
        "fov": 1.5707963267948966
      },
      "linkHotspots": [
        {
          "yaw": -0.7576950837431191,
          "pitch": 0.1939881462182722,
          "rotation": 0,
          "target": "1-ug-view-1"
        }
      ],
      "infoHotspots": []
    }
  ],
  "name": "Project Title",
  "settings": {
    "mouseViewMode": "drag",
    "autorotateEnabled": true,
    "fullscreenButton": false,
    "viewControlButtons": false
  }
};
