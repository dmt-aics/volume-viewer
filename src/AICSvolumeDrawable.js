import AICSvolume from './AICSvolume.js';
import { getColorByChannelIndex } from './constants/colors.js';
import MeshVolume from './meshVolume.js';
import RayMarchedAtlasVolume from './rayMarchedAtlasVolume.js';

/**
 * A renderable multichannel volume image with 8-bits per channel intensity values.
 * @class
 * @param {imageInfo} imageInfo 
 */
function AICSvolumeDrawable(imageInfo) {
  
  // THE VOLUME DATA
  this.volume = new AICSvolume(imageInfo);

  this.onChannelDataReadyCallback = null;

  this.channel_colors = this.volume.channel_colors_default.slice();

  this.fusion = this.channel_colors.map((col, index) => {
    let rgbColor;
    // take copy of original channel color
    if (col[0] === 0 && col[1] === 0 && col[2] === 0) {
      rgbColor = 0;
    } else {
      rgbColor = [col[0], col[1], col[2]];
    }
    return {
      chIndex: index,
      lut:[],
      rgbColor: rgbColor
    };
  });

  this.specular = new Array(this.volume.num_channels).fill([0,0,0]);
  this.emissive = new Array(this.volume.num_channels).fill([0,0,0]);
  this.roughness = new Array(this.volume.num_channels).fill(0);

  this.sceneRoot = new THREE.Object3D();//create an empty container

  this.rayMarchedAtlasVolume = new RayMarchedAtlasVolume(this.volume);

  this.meshVolume = new MeshVolume(this.volume);

  // draw meshes first, and volume last, for blending and depth test reasons
  this.sceneRoot.add(this.meshVolume.get3dObject());
  this.sceneRoot.add(this.rayMarchedAtlasVolume.get3dObject());

  this.bounds = {
    bmin: new THREE.Vector3(-0.5, -0.5, -0.5),
    bmax: new THREE.Vector3(0.5, 0.5, 0.5)
  };

  var cx = 0.0;
  var cz = 0.0;
  var cy = 0.0;
  this.sceneRoot.position.set(cx,cy,cz);
  this.maxSteps = 256;

  this.setScale(this.volume.scale);

  // // create one intensity lut per channel
  // this.lut = new Array(this.volume.num_channels);
  // for (let i = 0; i < this.volume.num_channels; ++i) {
  //   this.lut[i] = new Uint8Array(256);
  //   for (let j = 0; j < 256; ++j) {
  //     this.lut[i][j] = j;
  //   }
  // }
}

/**
 * Assign volume data via a 2d array containing the z slices as tiles across it.  Assumes that the incoming data is consistent with the image's pre-existing imageInfo tile metadata.
 * @param {number} channelIndex 
 * @param {Uint8Array} atlasdata 
 * @param {number} atlaswidth 
 * @param {number} atlasheight 
 */
AICSvolumeDrawable.prototype.setChannelDataFromAtlas = function(channelIndex, atlasdata, atlaswidth, atlasheight) {
  this.volume.setChannelDataFromAtlas(channelIndex, atlasdata, atlaswidth, atlasheight);
  this.onChannelLoaded([channelIndex]);
};

/**
 * Assign volume data as a 3d array ordered x,y,z. The xy size must be equal to tilewidth*tileheight from the imageInfo used to construct this AICSvolume.  Assumes that the incoming data is consistent with the image's pre-existing imageInfo tile metadata.
 * @param {number} channelIndex 
 * @param {Uint8Array} volumeData 
 */
AICSvolumeDrawable.prototype.setChannelDataFromVolume = function(channelIndex, volumeData) {
  this.volume.setChannelDataFromVolume(channelIndex, volumeData);
  this.onChannelLoaded([channelIndex]);
};

AICSvolumeDrawable.prototype.resetSampleRate = function() {
  this.steps = this.maxSteps / 2;
};

AICSvolumeDrawable.prototype.setMaxSampleRate = function(qual) {
  this.maxSteps = qual;
  this.setUniform('maxSteps', qual);
};

AICSvolumeDrawable.prototype.setScale = function(scale) {

  this.scale = scale;

  this.currentScale = scale.clone();

  this.meshVolume.setScale(scale);

  this.rayMarchedAtlasVolume.setScale(scale);
};

AICSvolumeDrawable.prototype.setUniform = function(name, value) {
  this.rayMarchedAtlasVolume.setUniform(name, value);
};

AICSvolumeDrawable.prototype.setUniformNoRerender = function(name, value) {
  this.rayMarchedAtlasVolume.setUniform(name, value);
};

AICSvolumeDrawable.prototype.setResolution = function(viewObj) {
  this.rayMarchedAtlasVolume.setResolution(viewObj);
  this.meshVolume.setResolution(viewObj);
};

// TODO handle this differently in 3D mode vs 2D mode?
/**
 * Set clipping range (between 0 and 1) for a given axis.
 * @param {number} axis 0, 1, or 2 for x, y, or z axis
 * @param {number} minval 0..1, should be less than maxval
 * @param {number} maxval 0..1, should be greater than minval 
 * @param {boolean} isOrthoAxis is this an orthographic projection or just a clipping of the range for perspective view
 */
AICSvolumeDrawable.prototype.setAxisClip = function(axis, minval, maxval, isOrthoAxis) {
  this.bounds.bmax[axis] = maxval;
  this.bounds.bmin[axis] = minval;

  this.rayMarchedAtlasVolume.setAxisClip(axis, minval, maxval, isOrthoAxis);
  this.meshVolume.setAxisClip(axis, minval, maxval, isOrthoAxis);
};

AICSvolumeDrawable.prototype.setOrthoThickness = function(value) {
  this.rayMarchedAtlasVolume.setOrthoThickness(value);
  this.meshVolume.setOrthoThickness(value);  
};

AICSvolumeDrawable.prototype.onAnimate = function(canvas) {
  // TODO: this is inefficient, as this work is duplicated by threejs.
  // we need camera matrix up to date before giving the 3d objects a chance to use it.
  canvas.camera.updateMatrixWorld(true);
  canvas.camera.matrixWorldInverse.getInverse( canvas.camera.matrixWorld );

  const isVR = canvas.isVR();
  if (isVR) {
    // raise volume drawable to about 1 meter.
    this.sceneRoot.position.y = 1.0;
  }
  else {
    this.sceneRoot.position.y = 0.0;
  }

  this.rayMarchedAtlasVolume.doRender(canvas);
  this.meshVolume.doRender(canvas);

};

/**
 * If an isosurface exists, update its isovalue and regenerate the surface. Otherwise do nothing.
 * @param {number} channel 
 * @param {number} value 
 */
AICSvolumeDrawable.prototype.updateIsovalue = function(channel, value) {
  this.meshVolume.updateIsovalue(channel, value);
};

/**
 * 
 * @param {number} channel 
 * @return {number} the isovalue for this channel or undefined if this channel does not have an isosurface created
 */
AICSvolumeDrawable.prototype.getIsovalue = function(channel) {
  return this.meshVolume.getIsovalue(channel);
};

/**
 * Set opacity for isosurface
 * @param {number} channel 
 * @param {number} value Opacity
 */
AICSvolumeDrawable.prototype.updateOpacity = function(channel, value) {
  this.meshVolume.updateOpacity(channel, value);
};

/**
 * 
 * @param {number} channel 
 * @return true if there is currently a mesh isosurface for this channel
 */
AICSvolumeDrawable.prototype.hasIsosurface = function(channel) {
  return this.meshVolume.hasIsosurface(channel);
};

/**
 * If an isosurface is not already created, then create one.  Otherwise do nothing.
 * @param {number} channel 
 * @param {number} value isovalue
 * @param {number=} alpha Opacity
 * @param {boolean=} transp render surface as transparent object
 */
AICSvolumeDrawable.prototype.createIsosurface = function(channel, value, alpha, transp) {
  this.meshVolume.createIsosurface(channel, value, alpha, transp);
};

AICSvolumeDrawable.prototype.fuse = function() {
  if (!this.volume) {
    return;
  }
  //if (!this.volume.loaded) {
  //	return;
  //}

  this.rayMarchedAtlasVolume.fuse(this.fusion, this.volume.channels);

  if (this.redraw) {
    this.redraw();
  }

};

AICSvolumeDrawable.prototype.setVoxelSize = function(values) {
  // basic error check.  bail out if we get something bad.
  if (!values.length || values.length < 3) {
    return;
  }

  // only set the data if it is > 0.  zero is not an allowed value.
  if (values[0] > 0) {
    this.pixel_size[0] = values[0];
  }
  if (values[1] > 0) {
    this.pixel_size[1] = values[1];
  }
  if (values[2] > 0) {
    this.pixel_size[2] = values[2];
  }

  var physSizeMin = Math.min(this.pixel_size[0], Math.min(this.pixel_size[1], this.pixel_size[2]));
  var pixelsMax = Math.max(this.imageInfo.width, Math.max(this.imageInfo.height,this.z));
  var sx = this.pixel_size[0]/physSizeMin * this.imageInfo.width/pixelsMax;
  var sy = this.pixel_size[1]/physSizeMin * this.imageInfo.height/pixelsMax;
  var sz = this.pixel_size[2]/physSizeMin * this.z/pixelsMax;

  this.setScale(new THREE.Vector3(sx,sy,sz));

};

AICSvolumeDrawable.prototype.cleanup = function() {
  this.meshVolume.cleanup();
  this.rayMarchedAtlasVolume.cleanup();
};

/**
 * @return a reference to the list of channel names
 */
AICSvolumeDrawable.prototype.channelNames = function() {
  return this.channel_names;
};

AICSvolumeDrawable.prototype.getChannel = function(channelIndex) {
  return this.volume.getChannel(channelIndex);
};

AICSvolumeDrawable.prototype.onChannelLoaded = function(batch) {
  this.rayMarchedAtlasVolume.onChannelData(batch);
  // any channels not yet loaded must just be set to 0 color for this fuse.
  this.fuse();

  this.meshVolume.onChannelData(batch);

  // let the outside world have a chance
  if (this.onChannelDataReadyCallback) {
    this.onChannelDataReadyCallback();
  }
};

/**
 * Save a channel's isosurface as a triangle mesh to either STL or GLTF2 format.  File will be named automatically, using image name and channel name.
 * @param {number} channelIndex 
 * @param {string} type Either 'GLTF' or 'STL'
 */
AICSvolumeDrawable.prototype.saveChannelIsosurface = function(channelIndex, type) {
  this.meshVolume.saveChannelIsosurface(channelIndex, type, this.name);
};

/**
 * Hide or display volume data for a channel
 * @param {number} channelIndex 
 * @param {boolean} enabled 
 */
AICSvolumeDrawable.prototype.setVolumeChannelEnabled = function(channelIndex, enabled) {
  // flip the color to the "null" value
  this.fusion[channelIndex].rgbColor = enabled ? this.channel_colors[channelIndex] : 0;
  // if all are nulled out, then hide the volume element from the scene.
  if (this.fusion.every((elem)=>(elem.rgbColor === 0))) {
    this.rayMarchedAtlasVolume.setVisible(false);
  }
  else {
    this.rayMarchedAtlasVolume.setVisible(true);
  }
};

/**
 * Is a the volume data for a channel being shown?
 * @param {number} channelIndex 
 */
AICSvolumeDrawable.prototype.isVolumeChannelEnabled = function(channelIndex) {
  // the zero value for the fusion rgbColor is the indicator that a channel is hidden.
  return this.fusion[channelIndex].rgbColor !== 0;
};

/**
 * Set the color for a channel
 * @param {number} channelIndex 
 * @param {Array.<number>} colorrgb [r,g,b]
 */
AICSvolumeDrawable.prototype.updateChannelColor = function(channelIndex, colorrgb) {
  if (!this.channel_colors[channelIndex]) {
    return;
  }
  this.channel_colors[channelIndex] = colorrgb;
  // if volume channel is zero'ed out, then don't update it until it is switched on again.
  if (this.fusion[channelIndex].rgbColor !== 0) {
    this.fusion[channelIndex].rgbColor = colorrgb;
    this.fuse();
  }
  this.meshVolume.updateMeshColors(this.channel_colors);
};

/**
 * Set the material for a channel
 * @param {number} channelIndex 
 * @param {Array.<number>} colorrgb [r,g,b]
 * @param {Array.<number>} specularrgb [r,g,b]
 * @param {Array.<number>} emissivergb [r,g,b]
 * @param {number} roughness
 */
AICSvolumeDrawable.prototype.updateChannelMaterial = function(channelIndex, colorrgb, specularrgb, emissivergb, roughness) {
  if (!this.channel_colors[channelIndex]) {
    return;
  }
  this.updateChannelColor(channelIndex, colorrgb);
  this.specular[channelIndex] = specularrgb;
  this.emissive[channelIndex] = emissivergb;
  this.roughness[channelIndex] = roughness;
};

/**
 * Set the global density of the volume data
 * @param {number} density Roughly equivalent to opacity, or how translucent or opaque the volume is
 * @param {boolean=} no_redraw Set to true to delay re-rendering. Otherwise ignore.
 */
AICSvolumeDrawable.prototype.setDensity = function(density, no_redraw) {
  this.rayMarchedAtlasVolume.setDensity(density);
};

/**
 * Get the global density of the volume data
 */
AICSvolumeDrawable.prototype.getDensity = function() {
  return this.rayMarchedAtlasVolume.getDensity();
};

/**
 * Set the global brightness of the volume data
 * @param {number} brightness Roughly speaking, an intensity multiplier on the whole volume
 * @param {boolean=} no_redraw Set to true to delay re-rendering. Otherwise ignore.
 */
AICSvolumeDrawable.prototype.setBrightness = function(brightness, no_redraw) {
  this.rayMarchedAtlasVolume.setBrightness(brightness);
};

/**
 * Get the global brightness of the volume data
 */
AICSvolumeDrawable.prototype.getBrightness = function() {
  return this.rayMarchedAtlasVolume.getBrightness();
};

/**
 * Add a new channel ready to receive data from one of the setChannelDataFrom* calls.
 * Name and color will be defaulted if not provided. For now, leave imageInfo alone as the "original" data
 * @param {string} name 
 * @param {Array.<number>} color [r,g,b]
 */
AICSvolumeDrawable.prototype.appendEmptyChannel = function(name, color) {
  let idx = this.num_channels;
  let chcolor = color || getColorByChannelIndex(idx);
  this.channel_colors.push(chcolor);
  this.fusion.push({
    chIndex: idx,
    lut:[],
    rgbColor: chcolor
  });

  this.meshVolume.appendEmptyChannel(chname);
  this.rayMarchedAtlasVolume.appendEmptyChannel(chname);

  return idx;
};

/**
 * Assign a channel index as a mask channel (will multiply its color against the entire visible volume)
 * @param {number} channelIndex 
 */
AICSvolumeDrawable.prototype.setChannelAsMask = function(channelIndex) {
  if (!this.volume.channels[channelIndex] || !this.volume.channels[channelIndex].loaded) {
    return false;
  }
  return this.rayMarchedAtlasVolume.setChannelAsMask(channelIndex);
};

/**
 * Get a value from the volume data
 * @return {number} the intensity value from the given channel at the given xyz location
 * @param {number} c The channel index
 * @param {number} x 
 * @param {number} y 
 * @param {number} z 
 */
AICSvolumeDrawable.prototype.getIntensity = function(c, x, y, z) {
  return this.volume.getIntensity(c, x, y, z);
};

export default AICSvolumeDrawable;
