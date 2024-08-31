import React, { useEffect, useRef, useState } from 'react';
import * as tf from '@tensorflow/tfjs';
import * as poseDetection from '@tensorflow-models/pose-detection';
import '@tensorflow/tfjs-backend-webgl';
import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader';
import './App.css';

function App() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [sunglasses, setSunglasses] = useState(null);

  useEffect(() => {
    let detector;
    let scene, camera, renderer;

    async function setupPoseDetector() {
      await tf.setBackend('webgl');
      const model = poseDetection.SupportedModels.MoveNet;
      const detectorConfig = {
        modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING
      };
      detector = await poseDetection.createDetector(model, detectorConfig);
      console.log("Pose detection model loaded");
    }

    async function loadSunglasses() {
      const loader = new OBJLoader();
      return new Promise((resolve, reject) => {
        loader.load(
          `${process.env.PUBLIC_URL}/glass.obj`,
          (object) => {
            console.log("OBJ loaded successfully:", object);
            object.scale.set(0.01, 0.01, 0.01);  // Adjust scale as needed
            object.position.set(0, 0, -3);  // Adjust position as needed
            
            // If the model needs rotation, uncomment and adjust these lines
            // object.rotation.x = Math.PI / 2;
            // object.rotation.y = Math.PI;
            // object.rotation.z = Math.PI / 2;

            console.log("Sunglasses model processed");
            resolve(object);
          },
          (progress) => {
            console.log(`Loading sunglasses... ${(progress.loaded / progress.total * 100).toFixed(2)}%`);
          },
          (error) => {
            console.error("Error loading sunglasses model:", error);
            reject(error);
          }
        );
      });
    }

    async function setupScene() {
      try {
        scene = new THREE.Scene();
        camera = new THREE.PerspectiveCamera(75, 600 / 600, 0.1, 1000);
        renderer = new THREE.WebGLRenderer({ alpha: true, canvas: canvasRef.current });
        renderer.setSize(600, 600);

        const glasses = await loadSunglasses();
        if (glasses) {
          scene.add(glasses);
          setSunglasses(glasses);
          console.log("Sunglasses added to the scene");
        } else {
          console.error("Glasses model is null or undefined");
        }

        // Add a light to the scene
        const light = new THREE.PointLight(0xffffff, 1, 100);
        light.position.set(0, 0, 10);
        scene.add(light);

        // Add ambient light
        const ambientLight = new THREE.AmbientLight(0x404040);
        scene.add(ambientLight);

        camera.position.z = 5;

        // Initial render
        renderer.render(scene, camera);
      } catch (error) {
        console.error("Error in setupScene:", error);
      }
    }

    async function startWebcam() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
          video: { width: 600, height: 600 } 
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => {
            videoRef.current.play();
            detectPose();
          };
        }
      } catch (err) {
        console.error("Error accessing webcam:", err);
      }
    }

    async function detectPose() {
      if (detector && videoRef.current && canvasRef.current && sunglasses) {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        const poses = await detector.estimatePoses(video);
        
        // Clear the Three.js renderer
        renderer.clear();
        
        if (poses.length > 0) {
          const pose = poses[0];
          const leftEye = pose.keypoints.find(point => point.name === 'left_eye');
          const rightEye = pose.keypoints.find(point => point.name === 'right_eye');

          if (leftEye && rightEye) {
            const midX = (leftEye.x + rightEye.x) / 2;
            const midY = (leftEye.y + rightEye.y) / 2;
            const eyeDistance = Math.sqrt(Math.pow(rightEye.x - leftEye.x, 2) + Math.pow(rightEye.y - leftEye.y, 2));

            // Convert to normalized coordinates (-1 to 1)
            const normalizedX = (midX / video.videoWidth) * 2 - 1;
            const normalizedY = -((midY / video.videoHeight) * 2 - 1);

            // Adjust these values to fine-tune the positioning and scaling
            const scaleFactor = eyeDistance / 50;  // Adjust this divisor to change overall scale
            const xPosition = normalizedX * 3;  // Adjust multiplier as needed
            const yPosition = normalizedY * 2;  // Adjust multiplier as needed
            const zPosition = -3;

            // Update sunglasses position and scale
            sunglasses.position.set(xPosition, yPosition, zPosition);
            sunglasses.scale.set(scaleFactor, scaleFactor, scaleFactor);

            // Render the Three.js scene
            renderer.render(scene, camera);

            // Draw debug circles for eye positions
            ctx.fillStyle = 'red';
            ctx.beginPath();
            ctx.arc(leftEye.x, leftEye.y, 5, 0, 2 * Math.PI);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(rightEye.x, rightEye.y, 5, 0, 2 * Math.PI);
            ctx.fill();

            console.log("Eye distance:", eyeDistance);
            console.log("Scale factor:", scaleFactor);
            console.log("Sunglasses position:", sunglasses.position);
            console.log("Sunglasses scale:", sunglasses.scale);
          }
        }

        requestAnimationFrame(detectPose);
      }
    }

    setupPoseDetector()
      .then(setupScene)
      .then(startWebcam);

    // Clean up function
    return () => {
      if (videoRef.current && videoRef.current.srcObject) {
        videoRef.current.srcObject.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  return (
    <div className="App">
      <div className="video-container">
        <video ref={videoRef} autoPlay playsInline muted className="video-canvas" />
        <canvas ref={canvasRef} className="overlay-canvas" />
      </div>
    </div>
  );
}

export default App;
