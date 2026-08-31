import Phaser from 'phaser';
import BootScene from './scenes/BootScene.js';
import TownScene from './scenes/TownScene.js';
import DungeonScene from './scenes/DungeonScene.js';
import FoundryScene from './scenes/FoundryScene.js';
import ReactorScene from './scenes/ReactorScene.js';
import CoreScene from './scenes/CoreScene.js';
import DistrictScene from './scenes/DistrictScene.js';
import TowerScene from './scenes/TowerScene.js';
import ArsenalScene from './scenes/ArsenalScene.js';
import NexusScene from './scenes/NexusScene.js';
import VigilanceScene from './scenes/VigilanceScene.js';
import SubmundoScene from './scenes/SubmundoScene.js';
import FantasmaScene from './scenes/FantasmaScene.js';
import MercadoNegroScene from './scenes/MercadoNegroScene.js';
import UIScene from './scenes/UIScene.js';

const config = {
  type: Phaser.AUTO,
  width: 960,
  height: 600,
  parent: 'game-container',
  backgroundColor: '#0a0a14',
  pixelArt: true,
  roundPixels: true,
  physics: {
    default: 'arcade',
    arcade: {
      debug: false
    }
  },
  scene: [BootScene, TownScene, DungeonScene, FoundryScene, ReactorScene, CoreScene, DistrictScene, TowerScene, ArsenalScene, NexusScene, VigilanceScene, SubmundoScene, FantasmaScene, MercadoNegroScene, UIScene]
};

window.__game = new Phaser.Game(config);
