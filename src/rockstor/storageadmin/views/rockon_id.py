"""
Copyright (c) 2012-2013 RockStor, Inc. <http://rockstor.com>
This file is part of RockStor.

RockStor is free software; you can redistribute it and/or modify
it under the terms of the GNU General Public License as published
by the Free Software Foundation; either version 2 of the License,
or (at your option) any later version.

RockStor is distributed in the hope that it will be useful, but
WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU
General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program. If not, see <http://www.gnu.org/licenses/>.
"""

from rest_framework.response import Response
from django.db import transaction
from storageadmin.models import (RockOn, DContainer, DVolume, Share, DPort)
from storageadmin.serializers import RockOnSerializer
import rest_framework_custom as rfc
from storageadmin.util import handle_exception
from rockon_helpers import (docker_status, start, stop, install, uninstall)

import logging
logger = logging.getLogger(__name__)


class RockOnIdView(rfc.GenericView):
    serializer_class = RockOnSerializer

    def get_queryset(self, *args, **kwargs):
        return RockOn.objects.all()

    @transaction.commit_on_success
    def post(self, request, rid, command):
        with self._handle_exception(request):

            if (not docker_status()):
                e_msg = ('Docker service is not running. Start it and try '
                         'again.')
                handle_exception(Exception(e_msg), request)

            try:
                rockon = RockOn.objects.get(id=rid)
            except:
                e_msg = ('Rock-on(%d) does not exist' % rid)
                handle_exception(Exception(e_msg), request)

            if (command == 'install'):
                share_map = request.DATA.get('shares')
                logger.debug('share map = %s' % share_map)
                port_map = request.DATA.get('ports')
                logger.debug('port map = %s' % port_map)
                cc_map = request.DATA.get('cc')
                logger.debug('cc map = %s' % cc_map)
                containers = DContainer.objects.filter(rockon=rockon)
                for co in containers:
                    for s in share_map.keys():
                        if (not Share.objects.filter(name=s).exists()):
                            e_msg = ('Invalid Share(%s).' % s)
                            handle_exception(Exception(e_msg), request)
                        so = Share.objects.get(name=s)
                        vo = DVolume.objects.get(container=co,
                                                 dest_dir=share_map[s])
                        vo.share = so
                        vo.save()
                    for p in port_map.keys():
                        if (not DPort.objects.filter(containerp=p).exists()):
                            e_msg = ('Invalid Port(%s).' % p)
                            handle_exception(Exception(e_msg), request)
                        po = DPort.objects.get(containerp=p)
                        po.hostp = port_map[p]
                        po.save()
                        link_crumbs = []
                        if (rockon.link is not None):
                            link_crumbs = rockon.link.split('/')
                        if (len(link_crumbs[0]) > 0 and link_crumbs[0] == ':'):
                            link_crumbs = link_crumbs[1:]
                        rockon.link = (':%s' % po.hostp)
                        if (len(link_crumbs) > 0):
                            rockon.link = ('%s/%s' %
                                           (rockon.link,
                                            ('/').join(link_crumbs)))
                install.async(rockon.id)
                rockon.state = 'pending_install'
                rockon.save()
            elif (command == 'uninstall'):
                if (rockon.state != 'installed'):
                    e_msg = ('Rock-on(%s) is not currently installed. Cannot '
                             'uninstall it' % rid)
                    handle_exception(Exception(e_msg), request)
                if (rockon.status != 'stopped'):
                    e_msg = ('Rock-on(%s) must be stopped before it can '
                             'be uninstalled. Stop it and try again' %
                             rid)
                    handle_exception(Exception(e_msg), request)
                uninstall.async(rockon.id)
                rockon.state = 'uninstall_pending'
                rockon.save()
                for co in DContainer.objects.filter(rockon=rockon):
                    DVolume.objects.filter(container=co, uservol=True).delete()
            elif (command == 'update'):
                if (rockon.state != 'installed'):
                    e_msg = ('Rock-on(%s) is not currently installed. Cannot '
                             'uninstall it' % rid)
                    handle_exception(Exception(e_msg), request)
                if (rockon.status != 'stopped'):
                    e_msg = ('Rock-on(%s) must be stopped before it can '
                             'be uninstalled. Stop it and try again' %
                             rid)
                    handle_exception(Exception(e_msg), request)
                share_map = request.DATA.get('shares')
                for co in DContainer.objects.filter(rockon=rockon):
                    for s in share_map.keys():
                        if (not Share.objects.filter(name=s).exists()):
                            e_msg = ('Invalid Share(%s).' % s)
                            handle_exception(Exception(e_msg), request)
                        so = Share.objects.get(name=s)
                        if (DVolume.objects.filter(container=co, share=so).exists()):
                            e_msg = ('Share(%s) is already assigned to this Rock-on' % s)
                            handle_exception(Exception(e_msg), request)
                        if (DVolume.objects.filter(container=co, dest_dir=share_map[s]).exists()):
                            e_msg = ('Directory(%s) is already mapped for this Rock-on' % share_map[s])
                            handle_exception(Exception(e_msg), request)
                        do = DVolume(container=co, share=so, dest_dir=share_map[s])
                        do.save()
            elif (command == 'stop'):
                stop.async(rockon.id)
                rockon.status = 'stop_pending'
                rockon.save()
            elif (command == 'start'):
                start.async(rockon.id)
                rockon.status = 'start_pending'
                rockon.save()
            elif (command == 'state_update'):
                state = request.DATA.get('new_state')
                rockon.state = state
                rockon.save()
            elif (command == 'status_update'):
                status = request.DATA.get('new_status')
                rockon.status = status
                rockon.save()
            return Response(RockOnSerializer(rockon).data)
