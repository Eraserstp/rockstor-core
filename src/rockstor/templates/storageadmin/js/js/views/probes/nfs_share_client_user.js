/*
 *
 * @licstart  The following is the entire license notice for the 
 * JavaScript code in this page.
 * 
 * Copyright (c) 2012-2013 RockStor, Inc. <http://rockstor.com>
 * This file is part of RockStor.
 * 
 * RockStor is free software; you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published
 * by the Free Software Foundation; either version 2 of the License,
 * or (at your option) any later version.
 * 
 * RockStor is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU
 * General Public License for more details.
 * 
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 * 
 * @licend  The above is the entire license notice
 * for the JavaScript code in this page.
 * 
 */

NfsShareClientUserView = Backbone.View.extend({
  initialize: function() {
    this.probe = this.options.probe;
    this.template = window.JST.probes_nfs_share_client_user;
    this.rowsumTemplate = window.JST.probes_nfs_share_client_user_rowsum;
    this.nfsAttrs = ["num_read", "num_write", "num_lookup"];
    this.treeType = "client";
    this.updateInterval = 5000; // update every updateInterval seconds
    this.rawData = null; // data returned from probe backend
  },

  render: function() {
    $(this.el).html(this.template({probe: this.probe}));
    this.rows = d3.select(this.el).select("#nfs-share-client-user-rows");
    var _this = this;
    if (this.probe.get("state") == probeStates.RUNNING) {
      var t2 = this.probe.get("start");
      var t1 = moment(t2).subtract("ms",this.updateInterval).toISOString();
      this.update(this.probe, t1, t2, true, this.updateInterval);
    } else if (this.probe.get("state") == probeStates.STOPPED) {
      var t1 = this.probe.get("start");
      var t2 = this.probe.get("end");
      this.update(this.probe, t1, t2, false, null);
    } 
    return this;
  },
  
  update: function(probe, t1, t2, repeat, updateInterval) {
    var _this = this;
    var dataUrl = this.probe.dataUrl() + "?t1=" + t1 + "&t2=" + t2;
    if (repeat) {
      this.renderIntervalId = window.setInterval(function() {
        _this.fetchAndRender(dataUrl);
        // update times
        t1 = t2;
        t2 = moment(t1).add("ms",_this.updateInterval).toISOString();
        dataUrl = _this.probe.dataUrl() + "?t1=" + t1 + "&t2=" + t2;
      }, updateInterval);
    } else {
      this.fetchAndRender(dataUrl);
    }
  },

  fetchAndRender: function(dataUrl) {
    var _this = this;
    $.ajax({
      url: dataUrl,
      type: "GET",
      dataType: "json",
      success: function(data, textStatus, jqXHR) {
        var data = _this.generateData(); // TODO remove after test
        _this.renderViz(data);
      },
      error: function(request, status, error) {
        console.log(error);
      }
    });
  },

  renderViz: function(data) {
    var _this = this;
    this.root = this.createTree(data, this.treeType, this.nfsAttrs, "num_read", 4);
    var rowHeight = 50;
    var rowPadding = 4;
    var length = this.root.children.length;
    this.attr = "num_read";
    
    var attrArray = _.flatten(_.map(this.root.children, function(n) {
      return _.map(n.children, function(d) { return d[_this.attr]; } );
    }));
    console.log(attrArray);
    this.attrMax = d3.max(attrArray);
    console.log(this.attrMax);
    
    // Create rows 
    var row = this.rows.selectAll("div.nfs-viz-row")
    .data(this.root.children, function(d,i) {
      return d.id;
    });
    var rowEnter = row.enter()
    .append("div")
    .attr("class", "nfs-viz-row")
    // enter at the bottom of the list
    .style("top", ((length-1)*(rowHeight + rowPadding*2)) + "px");
  
    // Render row contents 
    this.renderRow(row); 

    // move to sorted position
    var rowUpdate = row.transition()
    .duration(1000)
    .style("top",function(d,i) { 
      return (i*(rowHeight + rowPadding*2)) + "px"; 
    });
    
    var rowExit = row.exit();
    rowExit.remove();
    
  },
  
  renderRow: function(row) {
    var client = row.selectAll("div.client")
    .data(function(d,i) { return [d]; }, function(d) { return d.name});
    var clientEnter = client.enter().append("div").attr("class", "client");
    this.renderClient(client);
   
    var shares = row.selectAll("div.top-shares")
    .data(function(d,i) { return [d]; }, function(d) { return d.name});
    var sharesEnter = shares.enter().append("div").attr("class", "top-shares");
    this.renderShares(shares);
    
    var reads = row.selectAll("div.nfs-reads")
    .data(function(d,i) { return [d]; }, function(d) { return d.name});
    var readsEnter = reads.enter().append("div").attr("class", "nfs-reads");
    this.renderReads(reads);
   
    var writes = row.selectAll("div.nfs-writes")
    .data(function(d,i) { return [d]; }, function(d) { return d.name});
    var writesEnter = writes.enter().append("div").attr("class", "nfs-writes");
    this.renderWrites(writes);
    
    var lookups = row.selectAll("div.nfs-lookups")
    .data(function(d,i) { return [d]; }, function(d) { return d.name});
    var lookupsEnter = lookups.enter().append("div").attr("class", "nfs-lookups");
    this.renderLookups(lookups);

  },

  renderClient: function(client) {
    client.html("");
    client.append("img")
    .attr("src", "/img/computer.png")
    .attr("width", "20")
    .attr("height", "20");
    client.append("br");    
    client.append("span")
    .attr("class","nodeLabel")
    .text(function(d) { return d.name; });
  },

  renderShares: function(shares) {
    var _this = this;
    var shareWidth = 60;
    var sharePadding = 4;

    var shareData = shares.datum();
    var rScale = d3.scale.linear()
    .domain([0, this.attrMax])
    .range([2,10]);

    var share = shares.selectAll("div.share")
    .data(function(d) { return d.children; }, function(dItem){
      return dItem.id;
    });
    var shareEnter = share.enter()
    .append("div")
    .attr("class","share")
    
    shareEnter.append("svg")
    .attr("width", 50)
    .attr("height", 25)
    .append("g")
    .append("circle")
    .attr("cx", 25)
    .attr("cy", 10)
    .attr("r", function(d) { return rScale(d[_this.attr]); })
    .attr("fill", "steelblue");
    
    shareEnter.append("br");
    
    shareEnter.append("span")
    .attr("class","nodeLabel")
    .text(function(d) { return d.name; });

    share.select("circle").attr("r", function(d) { return rScale(d[_this.attr]); })

    var shareUpdate = share.transition()
    .style("left", function(d,i) { 
      return (i*(shareWidth + sharePadding*2)) + "px";
    });
    
    var shareExit = share.exit();
    shareExit.remove();

  },
  
  renderReads: function(reads) {
    reads.text(function(d) { return d["num_read"]; });
  },

  renderWrites: function(writes) {
    writes.text(function(d) { return d["num_write"]; });
  },

  renderLookups: function(lookups) {
    lookups.text(function(d) { return d["num_lookup"]; });
  },

  cleanup: function() {
    if (!_.isUndefined(this.renderIntervalId) && 
    !_.isNull(this.renderIntervalId)) {
      window.clearInterval(this.renderIntervalId);
    }
  },

  renderRowSumContents: function(rowSum) {
    var _this = this;
    var nfsAttrs = this.nfsAttrs;
    rowSum.html("");
    rowSum.each(function(d,i) {
      var el = d3.select(this);  
      el.html(_this.rowsumTemplate({d:d}));
    });
  },

  createTree: function(data, treeType, attrList, sortAttr, n) {
    var _this = this;
    var root = null;
    // types of nodes at level 1 and 2 of the tree
    var typeL1 = treeType == "client" ? "client" : "uid";
    var typeL2 = "share";
    root = this.createNode("root", "root");
    _.each(data, function(d) {
      var nodeL1 = _this.findOrCreateNodeWithName(
        root.children, d[typeL1], typeL1 
      );
      nodeL1.id = d[typeL1];
      var nodeL2 = _this.findOrCreateNodeWithName(
        nodeL1.children, d[typeL2], typeL2
      );
      nodeL2.id = d[typeL2] + "_" + d[typeL1];
      // update attributes - there may be multiple data points
      // for each node type, so add the attr values
      _.each(attrList, function(a) {
        root[a] = _.isUndefined(root[a]) ? d[a] : root[a] + d[a];
        nodeL1[a] = _.isUndefined(nodeL1[a]) ? d[a] : nodeL1[a] + d[a];
        nodeL2[a] = _.isUndefined(nodeL2[a]) ? d[a] : nodeL2[a] + d[a];
      });
    });
   
    // get top n children sorted by sortAttr 
    var children = root.children;
    root.children = [];
    var x = d3.scale.ordinal()
    x.range(d3.range(children.length));
    x.domain(d3.range(length).sort(function(a,b) {
      return children[b][sortAttr] - children[a][sortAttr];
    }));
    for (i=0; i<n; i++) {
      root.children.push(children[x(i)]);
    }
    return root;

  },

  findNodeWithName: function(nodeList, name) {
    return _.find(nodeList, function(node) {
      return node.name == name;
    });
  },

  findNodeWithId: function(nodeList, id) {
    return _.find(nodeList, function(node) {
      return node.id == id;
    });
  },

  findOrCreateNodeWithName: function(nodeList, name, nodeType) {
    var node = this.findNodeWithName(nodeList, name);
    if (_.isUndefined(node)) {
      node = this.createNode(name, nodeType);
      nodeList.push(node);
    }
    return node;
  },

  createNode: function(name, nodeType) {
    return {name: name, nodeType: nodeType, children: []};
  },
  
  filterData: function(data, treeType, selAttrs, n) {
    var list = [];
    _.each(data, function(d) {
      // find corresp obj in list (share or client)
      var e = _.find(list, function(el) {
        return el[treeType] == d[treeType];
      });
      if (_.isUndefined(e)) {
        e = {};
        e[treeType] = d[treeType];
        e.value = 0;
        list.push(e);
      }
      // add attr value 
      _.each(selAttrs, function(attr) {
        e.value = e.value + d[attr];
      });
    });
    list = (_.sortBy(list, function(e) { 
      return e.value; 
    })).reverse().slice(0,n);
    return _.filter(data, function(d) {
      return _.find(list, function(e) {
        return e[treeType] == d[treeType];
      });
    });
  },

  generateData: function() {
    var data = [];
    for (i=1; i<=3; i++) {
      var ip = "10.0.0." + i;
      for (j=1; j<=2; j++) {
        var share = "share_" + j;
        data.push({
          share: share,
          client: ip,
          num_read: 5 + Math.floor(Math.random() * 5),
          num_write: 1 + Math.floor(Math.random() * 5),
          num_lookup: 1 + Math.floor(Math.random() * 5),
        });
      }
    }
    var ipRandom1 = "10.0.0." + (5 + (Math.floor(Math.random() * 5)));
    var share1 = "share_1";
    var ipRandom2 = "10.0.0." + (10 + (Math.floor(Math.random() * 5)));
    var share2 = "share_2";
    var ipRandom3 = "10.0.0." + (15 + (Math.floor(Math.random() * 5)));
    var share3 = "share_3";
    data.push({
      share: share1,
      client: ipRandom1,
      num_read: 5 + Math.floor(Math.random() * 5),
      num_write: 1 + Math.floor(Math.random() * 5),
      num_lookup: 1 + Math.floor(Math.random() * 5),
    });
    data.push({
      share: share2,
      client: ipRandom2,
      num_read: 5 + Math.floor(Math.random() * 5),
      num_write: 1 + Math.floor(Math.random() * 5),
      num_lookup: 1 + Math.floor(Math.random() * 5),
    });
    data.push({
      share: share3,
      client: ipRandom3,
      num_read: 5 + Math.floor(Math.random() * 5),
      num_write: 1 + Math.floor(Math.random() * 5),
      num_lookup: 1 + Math.floor(Math.random() * 5),
    });
    return data;
  },


  // sorts children of root by attr
  sortTree: function(root, attr) {
    newChildren = _.sortBy(root.children, function(node) {
      return node[attr];
    }).reverse();
    root.children = newChildren;
  },

  // creates new root with n of oldroots children
  getTopN: function(root, n) {
    var newRoot = this.copyRoot(root, this.nfsAttrs);
    if (root.children.length > 0) {
      for (i=0; i<n; i++) {
        newRoot.children[i] = root.children[i];
        if (i == root.children.length-1) break;
      }
    }
    return newRoot;
  },

  findNode: function(root, id) {
    var n = null;
    if (root.id == id) {
      n = root;
    } else if (root.children) {
      for (var i=0; i<root.children.length; i++) {
        n = this.findNode(root.children[i], id);
        if (!_.isNull(n)) break;
      }
    } 
    return n;
  },

  createRoot: function(treeType, nfsAttrs) {
    var root = {};
    if (treeType == 'client') {
      root.name = 'clients';
      root.displayName = 'All clients';
      root.treeType = treeType;
      root.type = 'root';
      root.label = 'clients';
      root.children = [];
      _.each(nfsAttrs, function(attr) {
        root[attr] = 0;
      });
    }
    return root;
  },

  // Accepts date string in ISO 8601 format and returns 
  // date string 'dMs' milliseconds later
  getDateAfter: function(s, dMs) {
    var t1 = moment(s);
    return moment(t1).add("ms",dMs).toISOString();
  },

  // adds t1 and t2 to url, t2 is 'duration' seconds after t1
  appendTimeIntervaltoUrl: function(url, t1, duration) {
    var t2 = this.getDateAfter(t1, duration*1000);
    return url + "&t1=" + t1 + "&t2=" + _this.ts;
  }

});

RockStorProbeMap.push({
  name: 'nfs-share-client-user',
  view: 'NfsShareClientUserView',
  description: 'NFS Share, Client, User Distribution',
});



